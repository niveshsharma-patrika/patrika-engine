-- ═══════════════════════════════════════════════════════════════
-- Pipeline switches: per-stage on/off toggles for the ingest run.
--
-- Each row is one stage of the pipeline. The orchestrator (lib/ingest)
-- reads this table once per tick and skips any stage where enabled=false.
--
-- Stages, in order of execution:
--   fetch   — pull articles from RSS / sitemap / Google News (free)
--   enrich  — fetch each article URL, parse JSON-LD (free, network only)
--   embed   — Gemini text-embedding-001 (PAID — Google bill)
--   cluster — Groq verify + polish for trend creation (PAID — Groq bill)
--
-- Env vars still win: SKIP_FETCH=1 and SKIP_CLUSTER=1 force the
-- corresponding stage(s) off regardless of what this table says. That's
-- the kill-switch path. The DB row is the "default state" — the env var
-- is the emergency stop. See lib/pipeline-settings.ts.
--
-- Defaults: fetch+enrich ON, embed+cluster OFF. Operator must explicitly
-- re-enable AI from the admin UI once the cost picture is acceptable.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.pipeline_settings (
  key         text primary key,
  enabled     boolean not null,
  label       text not null,
  description text,
  updated_at  timestamptz not null default now()
);

insert into public.pipeline_settings (key, enabled, label, description) values
  ('fetch',
   true,
   'Fetch articles',
   'Pull new articles from RSS / sitemap / Google News sources. Free. URL-level dedup happens before insert.'),
  ('enrich',
   true,
   'Enrich (JSON-LD)',
   'For each new signal, fetch the article URL and parse JSON-LD for description / keywords / section. Free (network only).'),
  ('embed',
   false,
   'Embed (Gemini AI)',
   'Generate 768-dim embeddings for signals via gemini-embedding-001. Paid — Google bill. Required for clustering.'),
  ('cluster',
   false,
   'Cluster (Groq AI)',
   'Run verify (gpt-oss-120b) and polish (Llama 4 Scout) on coarse clusters to create trend rows. Paid — Groq bill.')
on conflict (key) do nothing;
