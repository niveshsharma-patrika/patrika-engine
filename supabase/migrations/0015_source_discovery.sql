-- ═══════════════════════════════════════════════════════════════
-- Source discovery — Phase 2 of the categorisation work.
--
-- After every refinement run, for each NEW trend, we query Google News
-- to see which publishers covered the same story. New publishers
-- (not already in our sources table) get queued here for review.
--
-- The user reviews on /sources/discovery and clicks Adopt / Dismiss / Hide.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.source_candidates (
  id uuid primary key default gen_random_uuid(),
  domain text not null,                       -- 'scroll.in', 'thequint.com', etc.
  sitemap_url text not null,                  -- the URL we'd use for ingestion
  evidence jsonb not null default '[]'::jsonb, -- [{trend_id, title, found_at}]
  evidence_count int not null default 1,      -- denormalised for sorting
  inferred_focus text,                        -- auto-tagged on candidate creation
  inferred_language text,
  today_article_count int default 0,          -- snapshot when first probed
  status text not null default 'pending'
    check (status in ('pending', 'adopted', 'dismissed', 'hidden')),
  notes text,                                 -- editor's note (rare)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A pending candidate per domain. After adoption/dismissal new evidence
-- can create a new row.
create unique index if not exists ux_source_candidates_pending_domain
  on public.source_candidates(domain)
  where status = 'pending';

create index if not exists idx_source_candidates_status_evidence
  on public.source_candidates(status, evidence_count desc);

-- ─── DENYLIST ─────────────────────────────────────────────────
-- Domains we should never re-propose. Two sources populate this:
--   1. User clicks "Dismiss" on a candidate → 30-day denylist entry
--   2. Seeded junk domains at migration time (PR wires, content farms)
create table if not exists public.source_denylist (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  reason text not null,                        -- 'user_dismissed' | 'seed_junk' | 'manual'
  expires_at timestamptz,                      -- null = permanent
  created_at timestamptz not null default now()
);

create index if not exists idx_source_denylist_expires
  on public.source_denylist(expires_at);

-- Seed obvious junk so the very first discovery run doesn't propose garbage.
insert into public.source_denylist (domain, reason, expires_at) values
  -- PR wires
  ('prnewswire.com',          'seed_junk', null),
  ('globenewswire.com',       'seed_junk', null),
  ('businesswire.com',        'seed_junk', null),
  ('einpresswire.com',        'seed_junk', null),
  ('freepressrelease.in',     'seed_junk', null),
  ('pressreleasepoint.com',   'seed_junk', null),
  ('medianews4u.com',         'seed_junk', null),
  -- Aggregators / content farms
  ('newsbeezer.com',          'seed_junk', null),
  ('worldakkam.com',          'seed_junk', null),
  ('flipboard.com',           'seed_junk', null),
  ('inshorts.com',            'seed_junk', null),
  ('dailyhunt.in',            'seed_junk', null),
  -- Wikipedia / non-news
  ('wikipedia.org',           'seed_junk', null),
  ('youtube.com',             'seed_junk', null),
  ('reddit.com',              'seed_junk', null),
  ('twitter.com',             'seed_junk', null),
  ('x.com',                   'seed_junk', null),
  ('facebook.com',            'seed_junk', null),
  ('linkedin.com',            'seed_junk', null)
  on conflict (domain) do nothing;

-- ─── SEARCH CACHE ─────────────────────────────────────────────
-- Per-trend caching: once we've searched Google News for trend X today,
-- don't search again today. Prevents wasted queries when a trend gets
-- refined multiple times in a day.
create table if not exists public.trend_searches (
  trend_id uuid primary key references public.trends(id) on delete cascade,
  searched_at timestamptz not null default now()
);
