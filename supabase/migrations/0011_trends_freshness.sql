-- ═══════════════════════════════════════════════════════════════
-- Freshness rule for trends.
--
-- A "trend" must be fresh:
--   • newest signal within last 60 minutes  (already tracked: last_updated)
--   • earliest signal within last 3 hours   (already tracked: first_seen)
--
-- The `first_seen` column already exists from 0001_init.sql with a
-- `default now()`, so no schema change is needed. The only thing this
-- migration adds is an index on first_seen, used by archival queries
-- and the dashboard's "is this still trending" filter.
--
-- Drops the previous national/world 8h exception in app code — even
-- big stories should be surfaced only while they're actually breaking.
-- ═══════════════════════════════════════════════════════════════

create index if not exists idx_trends_first_seen
  on public.trends(first_seen desc);
