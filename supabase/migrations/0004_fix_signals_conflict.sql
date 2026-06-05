-- ═══════════════════════════════════════════════════════════════
-- Fix: ON CONFLICT (source_id, external_id) was failing because
-- the index was partial (filtered by `external_id is not null`).
-- Replace with a full unique constraint so upsert works.
-- ═══════════════════════════════════════════════════════════════

-- Drop the old partial unique index
drop index if exists public.idx_signals_external;

-- Backfill any null external_ids (defensive — none should exist yet)
update public.signals
  set external_id = id::text
  where external_id is null;

-- Lock external_id as required
alter table public.signals
  alter column external_id set not null;

-- Add the proper unique constraint
alter table public.signals
  add constraint signals_source_external_unique
  unique (source_id, external_id);
