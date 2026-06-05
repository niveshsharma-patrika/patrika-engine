-- ═══════════════════════════════════════════════════════════════
-- JSON-LD enrichment for signals.
--
-- Adds columns to store structured metadata extracted from each
-- article URL: the publisher's own description, keywords list, and
-- editorial section. Drastically improves embedding quality (4x
-- more text per signal) and gives keyword-based dedup as a second
-- signal alongside title-Jaccard.
--
-- Pipeline order, post-migration:
--   1. fetchRssFeed / fetchSitemapNews → insert signal rows
--   2. enrichSignals → for each new signal, GET url + parse JSON-LD,
--      UPDATE description / keywords / publisher_section / enriched_at
--   3. embedPendingSignals → embeds title + description (richer text)
--   4. clustering, verify, polish — uses keywords for dedup, section
--      as a hint to the polish prompt
-- ═══════════════════════════════════════════════════════════════

alter table public.signals
  add column if not exists description text,
  add column if not exists keywords text[],
  add column if not exists publisher_section text,
  add column if not exists enriched_at timestamptz,
  add column if not exists enrich_failed boolean not null default false;

-- Partial index: cheap "give me signals that still need enrichment".
create index if not exists idx_signals_pending_enrich
  on public.signals(id)
  where enriched_at is null and enrich_failed = false and url is not null;

-- GIN on keywords for fast overlap queries (used by future
-- keyword-based dedup and topic search).
create index if not exists idx_signals_keywords
  on public.signals using gin (keywords);
