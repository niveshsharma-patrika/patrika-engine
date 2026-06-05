-- ═══════════════════════════════════════════════════════════════
-- Phase 2 — Path C clustering.
--
-- Adds the columns needed by the embedding + LLM-verify + LLM-polish
-- pipeline that replaces the deleted token-overlap clusterer.
--
--   signals.embedding      vector(768)   Gemini text-embedding-004 vec
--   signals.embedded_at    timestamptz   when the embedding was computed
--   trends.last_polished_at timestamptz  when an LLM last rewrote it
--
-- The clustering pass itself lives in lib/clustering/. It runs after every
-- ingest tick, embeds any signals missing a vector (cap 2000 per tick to
-- stay inside the 300s function budget on the first backfill), coarse-
-- clusters today's signals by cosine ≥ 0.78, then for any cluster that
-- isn't already attached to an existing trend runs the LLM verify+polish
-- to create one.
--
-- Existing rows: this migration is purely additive. The 7,197 signals you
-- already have will get embeddings lazily across the next few cron ticks.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists vector;

alter table public.signals
  add column if not exists embedding vector(768),
  add column if not exists embedded_at timestamptz;

-- Partial index on rows still needing an embedding. Lets the embed pass
-- find the backlog cheaply without scanning the whole table.
create index if not exists idx_signals_pending_embedding
  on public.signals(id) where embedding is null;

-- We deliberately do NOT create an ivfflat/hnsw index here. The clustering
-- pass fetches today's signals into memory and computes cosine in JS, so
-- the index isn't on the hot path and ivfflat needs a populated table to
-- train. Add it in a follow-up once steady-state data is in.

alter table public.trends
  add column if not exists last_polished_at timestamptz;
