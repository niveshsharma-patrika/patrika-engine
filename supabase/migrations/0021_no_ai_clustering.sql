-- ═══════════════════════════════════════════════════════════════
-- No-AI clustering switchover.
--
-- The trend pipeline no longer uses embeddings or an LLM. Clustering is
-- pure lexical text-matching (lib/clustering/lexical.ts), so:
--
--   • trends gain `publisher_count` (distinct outlets) — the field the
--     3-source rule and the Breaking/Trending/Watching buckets read.
--   • trends gain `broke_at` — the moment a story reached 3 distinct
--     publishers, i.e. when it became "confirmed news". Breaking and
--     Trending ages are measured from this, not from row creation.
--   • the `cluster` pipeline stage is re-pointed at the no-AI clusterer
--     and turned ON by default; the paid `embed` (Gemini) stage is gone.
--
-- Purely additive to the schema — existing rows keep their data. On a
-- fresh database (the normal case) there are no trends yet, and the first
-- cron tick fills publisher_count / broke_at via the reconcile pass.
-- ═══════════════════════════════════════════════════════════════

-- ─── New trend columns ─────────────────────────────────────────
alter table public.trends
  add column if not exists publisher_count int not null default 0,
  add column if not exists broke_at timestamptz;

-- broke_at drives the breaking/trending windows; publisher_count gates the
-- 3-source rule. Index both for the dashboard's hot queries.
create index if not exists idx_trends_broke_at
  on public.trends(broke_at desc);
create index if not exists idx_trends_publisher_count
  on public.trends(publisher_count desc);

-- Best-effort backfill so any pre-existing trends still surface before the
-- first reconcile pass: assume each linked signal is a distinct publisher
-- (an upper bound the reconcile pass corrects), and treat first_seen as the
-- break time for already-active stories.
update public.trends
  set publisher_count = greatest(publisher_count, signal_count)
  where publisher_count = 0 and signal_count > 0;

update public.trends
  set broke_at = first_seen
  where broke_at is null and status = 'active' and signal_count >= 3;

-- ─── Pipeline stages: no-AI clustering on, embeddings gone ──────
-- Re-point the `cluster` stage at the lexical clusterer and enable it.
insert into public.pipeline_settings (key, enabled, label, description) values
  ('cluster',
   true,
   'Cluster (no-AI)',
   'Group same-story articles across publishers using lexical text-matching (no embeddings, no LLM). Free. Creates the trend rows behind Breaking / Trending / Watching.')
on conflict (key) do update
  set enabled = true,
      label = excluded.label,
      description = excluded.description,
      updated_at = now();

-- The paid embedding stage no longer exists in the pipeline.
delete from public.pipeline_settings where key = 'embed';
