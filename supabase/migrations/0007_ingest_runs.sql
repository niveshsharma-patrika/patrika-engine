-- ═══════════════════════════════════════════════════════════════
-- Track every ingestion run so the dashboard can show
-- "last updated X ago" + cron state (running / idle / stuck / error).
-- ═══════════════════════════════════════════════════════════════

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'error')),
  trigger text default 'cron'        -- 'cron' | 'manual' | 'unknown'
    check (trigger in ('cron', 'manual', 'unknown')),
  sources_fetched int default 0,
  sources_failed int default 0,
  signals_inserted int default 0,
  clusters_found int default 0,
  clusters_refined int default 0,
  trends_created int default 0,
  trends_updated int default 0,
  trends_archived int default 0,
  duration_ms int,
  error_message text
);

create index idx_ingest_runs_started on public.ingest_runs(started_at desc);
