-- ════════════════════════════════════════════════════════════
-- Patrika Engine — full database setup (all migrations, in order)
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run once on a fresh project.
-- ════════════════════════════════════════════════════════════

-- ─────────── 0001_init.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Patrika Engine — initial schema
-- Run in Supabase Dashboard → SQL Editor (or via supabase CLI)
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── PROFILES (extends auth.users) ─────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'reporter'
    check (role in ('admin', 'desk_head', 'sub_editor', 'reporter')),
  desk text,
  telegram_handle text,
  telegram_chat_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── AI PROVIDERS ──────────────────────────────────────────────
create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  provider_key text unique not null,      -- 'anthropic' | 'openai' | 'google' | 'groq'
  display_name text not null,
  api_key_encrypted text,                  -- AES-256-GCM via lib/crypto.ts
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── AI MODELS ─────────────────────────────────────────────────
create table public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.ai_providers(id) on delete cascade,
  model_key text not null,                 -- 'claude-sonnet-4-5'
  display_name text not null,
  context_window int,
  input_price_per_million numeric,         -- USD per 1M input tokens
  output_price_per_million numeric,
  capabilities jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  unique (provider_id, model_key)
);

-- ─── AI CONFIG (use_case → model) ──────────────────────────────
create table public.ai_config (
  use_case text primary key,               -- 'drafting' | 'headline' | 'summary' | 'embedding'
  model_id uuid not null references public.ai_models(id),
  fallback_model_id uuid references public.ai_models(id),
  system_prompt text,
  updated_at timestamptz default now()
);

-- ─── SOURCES ───────────────────────────────────────────────────
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null
    check (source_type in ('rss', 'twitter', 'google_news')),
  url text,                                -- RSS feed URL, or null
  handle text,                             -- @MumbaiPolice, or null
  desk text,
  is_active boolean not null default true,
  last_sync timestamptz,
  signals_24h int not null default 0,
  created_at timestamptz default now()
);

-- ─── WATCHLIST ─────────────────────────────────────────────────
create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entity_type text not null
    check (entity_type in ('person', 'organization', 'brand')),
  handles jsonb not null default '[]'::jsonb,   -- ["@elonmusk", "@teslaowners"]
  alerts_enabled boolean not null default true,
  hits_30d int not null default 0,
  last_hit timestamptz,
  created_at timestamptz default now()
);

-- ─── TRENDS (computed topics) ──────────────────────────────────
create table public.trends (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  desk text,
  section text,                            -- 'city' | 'business' | 'sports' | ...
  velocity_pct numeric,                    -- % change in signal velocity
  velocity_window text,                    -- '45m', '2h', etc. (display)
  trust_score int default 0 check (trust_score between 0 and 5),
  sentiment text,                          -- '78% concern'
  geography text,                          -- 'Mumbai 89%'
  suggested_angle text,
  signal_count int not null default 0,
  status text not null default 'active'
    check (status in ('active', 'archived', 'dismissed')),
  first_seen timestamptz default now(),
  last_updated timestamptz default now()
);
create index idx_trends_velocity on public.trends(velocity_pct desc);
create index idx_trends_status on public.trends(status, last_updated desc);

-- ─── SIGNALS (raw tweets, articles, etc) ───────────────────────
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete cascade,
  external_id text,                        -- tweet ID, article URL hash
  author text,                             -- '@MumbaiPolice' or 'Times of India'
  content text not null,
  url text,
  published_at timestamptz not null,
  ingested_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb,      -- {retweets, verified, ...}
  topic_id uuid references public.trends(id) on delete set null,
  watchlist_id uuid references public.watchlist(id) on delete set null
);
create index idx_signals_published on public.signals(published_at desc);
create index idx_signals_topic on public.signals(topic_id);
create unique index idx_signals_external
  on public.signals(source_id, external_id) where external_id is not null;

-- ─── DRAFTS (articles) ─────────────────────────────────────────
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  trend_id uuid references public.trends(id) on delete set null,
  title text not null,
  body text,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'awaiting_review', 'awaiting_approval', 'approved', 'published', 'rejected')),
  author_id uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  ai_model_id uuid references public.ai_models(id) on delete set null,
  word_count int default 0,
  style_match int,                         -- 0-100
  desk text,
  scheduled_at timestamptz,
  published_at timestamptz,
  image_url text,
  image_prompt text,
  generation_metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_drafts_status on public.drafts(status, updated_at desc);

-- ─── STYLE GUIDES ──────────────────────────────────────────────
create table public.style_guides (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_url text,                           -- Supabase Storage URL
  file_size_bytes bigint,
  pages int,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- ─── AI USAGE (cost tracking) ──────────────────────────────────
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  model_id uuid references public.ai_models(id) on delete set null,
  use_case text,
  input_tokens int default 0,
  output_tokens int default 0,
  cost_usd numeric default 0,
  user_id uuid references public.profiles(id) on delete set null,
  draft_id uuid references public.drafts(id) on delete set null,
  created_at timestamptz default now()
);
create index idx_ai_usage_created on public.ai_usage(created_at desc);

-- ─── THIRD-PARTY API KEYS ──────────────────────────────────────
-- For non-AI services: Twitter, Google News, Telegram, WordPress CMS, etc.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  service text unique not null,
  display_name text not null,
  key_encrypted text not null,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── updated_at triggers ───────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_ai_providers_updated_at
  before update on public.ai_providers
  for each row execute function public.set_updated_at();

create trigger trg_drafts_updated_at
  before update on public.drafts
  for each row execute function public.set_updated_at();

create trigger trg_api_keys_updated_at
  before update on public.api_keys
  for each row execute function public.set_updated_at();

-- ─── Auto-create profile on signup ─────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'reporter')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─────────── 0002_seed.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Seed: default AI providers, models, use-case configuration,
-- and a starter set of RSS sources.
-- Run AFTER 0001_init.sql
-- ═══════════════════════════════════════════════════════════════

-- ─── PROVIDERS ─────────────────────────────────────────────────
insert into public.ai_providers (provider_key, display_name) values
  ('anthropic', 'Anthropic'),
  ('openai', 'OpenAI'),
  ('google', 'Google Gemini'),
  ('groq', 'Groq')
on conflict (provider_key) do nothing;

-- ─── MODELS ────────────────────────────────────────────────────
do $$
declare
  anth_id  uuid;
  oai_id   uuid;
  goog_id  uuid;
  grq_id   uuid;
begin
  select id into anth_id from public.ai_providers where provider_key = 'anthropic';
  select id into oai_id  from public.ai_providers where provider_key = 'openai';
  select id into goog_id from public.ai_providers where provider_key = 'google';
  select id into grq_id  from public.ai_providers where provider_key = 'groq';

  insert into public.ai_models
    (provider_id, model_key, display_name, context_window, input_price_per_million, output_price_per_million, capabilities)
  values
    (anth_id, 'claude-opus-4-5',         'Claude Opus 4.5',    200000, 15,    75,   '{"vision": true}'::jsonb),
    (anth_id, 'claude-sonnet-4-5',       'Claude Sonnet 4.5',  200000, 3,     15,   '{"vision": true}'::jsonb),
    (anth_id, 'claude-haiku-4-5',        'Claude Haiku 4.5',   200000, 1,     5,    '{"vision": true}'::jsonb),
    (oai_id,  'gpt-4o',                  'GPT-4o',             128000, 2.5,   10,   '{"vision": true}'::jsonb),
    (oai_id,  'gpt-4o-mini',             'GPT-4o mini',        128000, 0.15,  0.6,  '{"vision": true}'::jsonb),
    (oai_id,  'gpt-4.1',                 'GPT-4.1',           1000000, 5,     15,   '{"vision": true}'::jsonb),
    (goog_id, 'gemini-2.0-flash',        'Gemini 2.0 Flash',  1000000, 0.075, 0.3,  '{"vision": true}'::jsonb),
    (goog_id, 'gemini-2.0-pro',          'Gemini 2.0 Pro',    2000000, 1.25,  5,    '{"vision": true}'::jsonb),
    (grq_id,  'llama-3.3-70b-versatile', 'Llama 3.3 70B',      128000, 0.59,  0.79, '{}'::jsonb),
    (grq_id,  'mixtral-8x7b-32768',      'Mixtral 8x7B',        32768, 0.24,  0.24, '{}'::jsonb)
  on conflict (provider_id, model_key) do nothing;
end $$;

-- ─── DEFAULT USE-CASE WIRING ───────────────────────────────────
do $$
declare
  claude_sonnet uuid;
  gemini_flash  uuid;
begin
  select m.id into claude_sonnet
    from public.ai_models m
    join public.ai_providers p on p.id = m.provider_id
    where p.provider_key = 'anthropic' and m.model_key = 'claude-sonnet-4-5';

  select m.id into gemini_flash
    from public.ai_models m
    join public.ai_providers p on p.id = m.provider_id
    where p.provider_key = 'google' and m.model_key = 'gemini-2.0-flash';

  insert into public.ai_config (use_case, model_id, system_prompt) values
    ('drafting',
     claude_sonnet,
     'You are a senior Patrika news desk editor. Write in Patrika''s voice: factual, dateline-led (CITY: ...), attributed quotes, no embellishment. Match the structure of a typical 600-word Indian newspaper feature. Never invent quotes or sources.'),
    ('headline',
     claude_sonnet,
     'You write punchy newspaper headlines: 8-14 words, active voice, no clickbait. Return a single headline only.'),
    ('summary',
     gemini_flash,
     'Summarize the input into 2 crisp sentences for an editorial brief.'),
    ('embedding',
     gemini_flash,
     null)
  on conflict (use_case) do nothing;
end $$;

-- ─── STARTER RSS SOURCES ───────────────────────────────────────
insert into public.sources (name, source_type, url, desk) values
  ('Times of India', 'rss', 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', null),
  ('NDTV',           'rss', 'https://feeds.feedburner.com/ndtvnews-top-stories', null),
  ('Hindustan Times','rss', 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml', null),
  ('The Hindu',      'rss', 'https://www.thehindu.com/news/national/feeder/default.rss', null),
  ('Economic Times', 'rss', 'https://economictimes.indiatimes.com/rssfeedstopstories.cms', 'business'),
  ('LiveMint',       'rss', 'https://www.livemint.com/rss/news', 'business'),
  ('ESPN Cricinfo',  'rss', 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', 'sports')
on conflict do nothing;


-- ─────────── 0003_rss_expand.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- RSS source expansion
-- 30+ Indian feeds across English national, business, sports,
-- regional, Hindi-language, and Patrika's competitor set.
--
-- Re-run safe (uses `on conflict (url) do nothing`-style filtering).
-- Run AFTER 0001_init.sql and 0002_seed.sql.
-- ═══════════════════════════════════════════════════════════════

-- Add a unique constraint on url so re-runs are idempotent.
-- (Only if not already present.)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sources_url_key'
      and conrelid = 'public.sources'::regclass
  ) then
    alter table public.sources
      add constraint sources_url_key unique (url);
  end if;
end $$;

insert into public.sources (name, source_type, url, desk) values
  -- ─── ENGLISH NATIONAL ──────────────────────────────────────
  ('Indian Express',          'rss', 'https://indianexpress.com/feed/',                                            null),
  ('News18',                  'rss', 'https://www.news18.com/rss/india.xml',                                       null),
  ('ThePrint',                'rss', 'https://theprint.in/feed/',                                                  null),
  ('Scroll.in',               'rss', 'https://scroll.in/feed',                                                     null),
  ('The Wire',                'rss', 'https://thewire.in/feed',                                                    null),
  ('The Quint',               'rss', 'https://www.thequint.com/stories.rss',                                       null),
  ('FirstPost',               'rss', 'https://www.firstpost.com/feed/india.xml',                                   null),
  ('Reuters India',           'rss', 'https://www.reuters.com/world/india/rss',                                    null),
  ('Deccan Herald',           'rss', 'https://www.deccanherald.com/feed.xml',                                      null),

  -- ─── BUSINESS / MARKETS ────────────────────────────────────
  ('Business Standard',       'rss', 'https://www.business-standard.com/rss/latest.rss',                           'business'),
  ('Moneycontrol',            'rss', 'https://www.moneycontrol.com/rss/MCtopnews.xml',                             'business'),
  ('Financial Express',       'rss', 'https://www.financialexpress.com/feed/',                                     'business'),
  ('Business Today',          'rss', 'https://www.businesstoday.in/rssfeeds/?id=home',                             'business'),
  ('Inc42',                   'rss', 'https://inc42.com/feed/',                                                    'business'),
  ('YourStory',               'rss', 'https://yourstory.com/feed',                                                 'business'),

  -- ─── SPORTS ────────────────────────────────────────────────
  ('Sportstar',               'rss', 'https://sportstar.thehindu.com/feeder/default.rss',                          'sports'),
  ('Times of India — Sports', 'rss', 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms',                   'sports'),

  -- ─── TECH ──────────────────────────────────────────────────
  ('Gadgets360',              'rss', 'https://gadgets360.com/rss/news',                                            'tech'),
  ('TechCrunch',              'rss', 'https://techcrunch.com/feed/',                                               'tech'),

  -- ─── POLITICS / LEGAL ──────────────────────────────────────
  ('LiveLaw',                 'rss', 'https://www.livelaw.in/news/rss',                                            'politics'),
  ('Bar and Bench',           'rss', 'https://www.barandbench.com/rss',                                            'politics'),

  -- ─── CITY-SPECIFIC ─────────────────────────────────────────
  ('Mumbai Mirror (TOI)',     'rss', 'https://timesofindia.indiatimes.com/rssfeeds/-2128838597.cms',               'city'),
  ('TOI — Delhi',             'rss', 'https://timesofindia.indiatimes.com/rssfeeds/-2128839596.cms',               'city'),
  ('TOI — Bengaluru',         'rss', 'https://timesofindia.indiatimes.com/rssfeeds/-2128833038.cms',               'city'),

  -- ─── HINDI-LANGUAGE (Patrika audience) ─────────────────────
  ('Aaj Tak',                 'rss', 'https://www.aajtak.in/rssfeeds/?id=home',                                    null),
  ('Dainik Bhaskar',          'rss', 'https://www.bhaskar.com/rss-v1--category-1300.xml',                          null),
  ('Dainik Jagran',           'rss', 'https://www.jagran.com/news-rss.xml',                                        null),
  ('Amar Ujala',              'rss', 'https://www.amarujala.com/rss/breaking-news.xml',                            null),
  ('Patrika (own)',           'rss', 'https://www.patrika.com/rss',                                                null),
  ('NDTV Hindi',              'rss', 'https://ndtv.in/rss',                                                        null),

  -- ─── PRESS RELEASES / OFFICIAL ─────────────────────────────
  ('PIB India',               'rss', 'https://pib.gov.in/rssfeed.aspx',                                            'politics'),

  -- ─── ENTERTAINMENT ─────────────────────────────────────────
  ('Bollywood Hungama',       'rss', 'https://www.bollywoodhungama.com/rss/news.xml',                              'entertainment'),
  ('Pinkvilla',               'rss', 'https://www.pinkvilla.com/rss.xml',                                          'entertainment')
on conflict (url) do nothing;


-- ─────────── 0004_fix_signals_conflict.sql ───────────
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


-- ─────────── 0005_hindi_columns.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Bilingual support: store Hindi translations alongside English
-- for trends. UI toggle picks language at render time.
-- ═══════════════════════════════════════════════════════════════

alter table public.trends
  add column if not exists title_hi text,
  add column if not exists desk_hi text,
  add column if not exists suggested_angle_hi text;

-- Also useful: language metadata for the original title (mostly 'en' from our RSS feeds)
alter table public.trends
  add column if not exists primary_lang text default 'en';


-- ─────────── 0006_more_sources.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Source expansion + Twitter via xcancel.com Nitter fork.
--
-- Plus: deactivate proven-dead sources and fix wrong URLs found
-- during the first few ingestion runs.
-- ═══════════════════════════════════════════════════════════════

-- ─── DEACTIVATE TRULY DEAD SOURCES ────────────────────────────
-- These returned auth errors, 410 Gone, or feeds that aren't valid RSS.
update public.sources set is_active = false where url in (
  'https://www.reuters.com/world/india/rss',                    -- 401 since 2023
  'https://www.financialexpress.com/feed/',                     -- 410 Gone
  'https://thewire.in/feed',                                    -- malformed XML
  'https://scroll.in/feed',                                     -- malformed XML
  'https://theprint.in/feed/',                                  -- not recognized as RSS
  'https://www.patrika.com/rss',                                -- not recognized as RSS
  'https://pib.gov.in/rssfeed.aspx'                             -- 403
);

-- ─── FIX 404 URLS ─────────────────────────────────────────────
update public.sources set url = 'https://www.deccanherald.com/rss/national.rss'
  where name = 'Deccan Herald';
update public.sources set url = 'https://www.livelaw.in/feed'
  where name = 'LiveLaw';
update public.sources set url = 'https://www.barandbench.com/feed'
  where name = 'Bar and Bench';
update public.sources set url = 'https://www.jagran.com/rss/news/national.xml'
  where name = 'Dainik Jagran';
update public.sources set url = 'https://www.bhaskar.com/rss-v1--category-1061.xml'
  where name = 'Dainik Bhaskar';
update public.sources set url = 'https://khabar.ndtv.com/rss/news'
  where name = 'NDTV Hindi';

-- ─── ADD MORE ENGLISH NATIONAL SOURCES ────────────────────────
insert into public.sources (name, source_type, url, desk) values
  ('The Tribune',             'rss', 'https://www.tribuneindia.com/rss/feed?catId=1',                                  null),
  ('OpIndia',                 'rss', 'https://www.opindia.com/feed/',                                                  null),
  ('Telegraph India',         'rss', 'https://www.telegraphindia.com/feeds/rss.jsp?id=10',                             null),
  ('IANS Live',               'rss', 'https://ianslive.in/rss/national.xml',                                           null),
  ('Outlook India',           'rss', 'https://www.outlookindia.com/rss/cmlink/9d2a7b0a-c0e1-4d4f-9a3b-7b2e8c5d4f1a',   null),
  ('Newslaundry',             'rss', 'https://www.newslaundry.com/feed',                                               null),
  ('National Herald',         'rss', 'https://www.nationalheraldindia.com/feed/',                                      null)
on conflict (url) do nothing;

-- ─── ADD MORE BUSINESS / TECH SOURCES ─────────────────────────
insert into public.sources (name, source_type, url, desk) values
  ('Mint Markets',            'rss', 'https://www.livemint.com/rss/markets',                                'business'),
  ('ET Markets',              'rss', 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', 'business'),
  ('ET Tech',                 'rss', 'https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms',     'tech'),
  ('Entrepreneur India',      'rss', 'https://www.entrepreneur.com/latest.rss',                              'business')
on conflict (url) do nothing;

-- ─── ADD MORE SPORTS SOURCES ──────────────────────────────────
insert into public.sources (name, source_type, url, desk) values
  ('Cricbuzz',                'rss', 'https://www.cricbuzz.com/rss/cricket-news',     'sports'),
  ('Wisden India',            'rss', 'https://wisden.com/feed',                       'sports'),
  ('Sportskeeda Cricket',     'rss', 'https://www.sportskeeda.com/feed/cricket',      'sports')
on conflict (url) do nothing;

-- ─── REGIONAL / LANGUAGE SOURCES ──────────────────────────────
insert into public.sources (name, source_type, url, desk) values
  ('Loksatta (Marathi)',      'rss', 'https://www.loksatta.com/feed/',                null),
  ('Maharashtra Times',       'rss', 'https://maharashtratimes.com/rssfeedsdefault.cms', null),
  ('Eenadu (Telugu)',         'rss', 'https://www.eenadu.net/rss.aspx',               null),
  ('Mathrubhumi (Malayalam)', 'rss', 'https://www.mathrubhumi.com/cmlink/1.207',      null),
  ('Anandabazar (Bengali)',   'rss', 'https://www.anandabazar.com/rss',               null)
on conflict (url) do nothing;

-- ═══════════════════════════════════════════════════════════════
-- TWITTER / X via xcancel.com (Nitter fork — free RSS).
--
-- xcancel exposes Twitter as RSS at `rss.xcancel.com/<handle>/rss`
-- but requires a one-time email-based whitelist of our reader.
--
-- HOW TO ACTIVATE (one-time, ~5 min effort + 1 day wait):
--   1. Email rss@xcancel.com from your work email
--   2. Subject: "RSS reader whitelist — Patrika-Engine"
--   3. Body must include this ID:
--      d838a64b9fc5ccb83058fc3d42d51fed0392a487bb6b2a14c7aa0f963afbd268
--   4. Mention: editorial trend monitoring at Patrika News,
--      ~16 handles polled every 10 min (~96 req/hr)
--   5. They reply within ~24h; once whitelisted, ingestion succeeds.
--
-- Until whitelisted, the cron will hit xcancel but get back a feed
-- with one "not whitelisted" item — silently dropped by the clustering
-- pass (no harm, just no Twitter signal).
--
-- IF DEPLOYED TO VERCEL: the whitelist may be IP-bound. If prod
-- breaks after whitelist works locally, re-email xcancel with the
-- new ID from your Vercel-hosted run.
-- ═══════════════════════════════════════════════════════════════
insert into public.sources (name, source_type, url, handle, desk) values
  ('@PMOIndia',     'twitter', 'https://rss.xcancel.com/PMOIndia/rss',     '@PMOIndia',     null),
  ('@narendramodi', 'twitter', 'https://rss.xcancel.com/narendramodi/rss', '@narendramodi', null),
  ('@AmitShah',     'twitter', 'https://rss.xcancel.com/AmitShah/rss',     '@AmitShah',     'politics'),
  ('@nitin_gadkari','twitter', 'https://rss.xcancel.com/nitin_gadkari/rss','@nitin_gadkari','politics'),
  ('@RahulGandhi',  'twitter', 'https://rss.xcancel.com/RahulGandhi/rss',  '@RahulGandhi',  'politics'),
  ('@RBI',          'twitter', 'https://rss.xcancel.com/RBI/rss',          '@RBI',          'business'),
  ('@SEBI_India',   'twitter', 'https://rss.xcancel.com/SEBI_India/rss',   '@SEBI_India',   'business'),
  ('@MEAIndia',     'twitter', 'https://rss.xcancel.com/MEAIndia/rss',     '@MEAIndia',     null),
  ('@MumbaiPolice', 'twitter', 'https://rss.xcancel.com/MumbaiPolice/rss', '@MumbaiPolice', 'city'),
  ('@DelhiPolice',  'twitter', 'https://rss.xcancel.com/DelhiPolice/rss',  '@DelhiPolice',  'city'),
  ('@mybmc',        'twitter', 'https://rss.xcancel.com/mybmc/rss',        '@mybmc',        'city'),
  ('@Indiametdept', 'twitter', 'https://rss.xcancel.com/Indiametdept/rss', '@Indiametdept', 'weather'),
  ('@ECISVEEP',     'twitter', 'https://rss.xcancel.com/ECISVEEP/rss',     '@ECISVEEP',     'politics'),
  ('@ANI',          'twitter', 'https://rss.xcancel.com/ANI/rss',          '@ANI',          null),
  ('@PTI_News',     'twitter', 'https://rss.xcancel.com/PTI_News/rss',     '@PTI_News',     null),
  ('@BCCI',         'twitter', 'https://rss.xcancel.com/BCCI/rss',         '@BCCI',         'sports')
on conflict (url) do nothing;


-- ─────────── 0007_ingest_runs.sql ───────────
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


-- ─────────── 0008_trends_v2_and_google_news.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Trends v2:
--   - story_type (Explainer / Breaking / Profile / Service piece / …)
--   - is_national_or_world (AI-flagged; exempt from the 1h freshness cap)
--   - story_type_hi for the Hindi toggle
--
-- Plus Google News via free RSS endpoints.
-- ═══════════════════════════════════════════════════════════════

alter table public.trends
  add column if not exists story_type text,
  add column if not exists story_type_hi text,
  add column if not exists is_national_or_world boolean not null default false;

-- ─── Google News RSS feeds (free, no API key) ─────────────────
insert into public.sources (name, source_type, url, desk) values
  ('Google News · Top Stories India',
   'google_news', 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en',                                            null),
  ('Google News · India National',
   'google_news', 'https://news.google.com/rss/headlines/section/topic/NATION?hl=en-IN&gl=IN&ceid=IN:en',             'national'),
  ('Google News · World',
   'google_news', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-IN&gl=IN&ceid=IN:en',              null),
  ('Google News · Business',
   'google_news', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en',           'business'),
  ('Google News · Technology',
   'google_news', 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en',         'tech'),
  ('Google News · Sports',
   'google_news', 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en',             'sports'),
  ('Google News · Entertainment',
   'google_news', 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-IN&gl=IN&ceid=IN:en',      'enter'),
  ('Google News · Science',
   'google_news', 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-IN&gl=IN&ceid=IN:en',            null),
  ('Google News · Health',
   'google_news', 'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en-IN&gl=IN&ceid=IN:en',             null)
on conflict (url) do nothing;


-- ─────────── 0009_city_feeds.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Hyperlocal city feeds — Jaipur, Kolkata, Pune, Chennai,
-- Hyderabad, Ahmedabad, Lucknow, Bhopal, Patna, Chandigarh, Kochi.
--
-- Three patterns used:
--   - Hindustan Times: cities/<city>-news/rssfeed.xml
--   - Indian Express : section/cities/<city>/feed/
--   - The Hindu      : news/cities/<city>/feeder/default.rss
--
-- All `desk='city'` so the section filter on the dashboard works.
-- ═══════════════════════════════════════════════════════════════

insert into public.sources (name, source_type, url, desk) values
  -- ─── JAIPUR (Patrika's home turf) ────────────────────────────
  ('HT · Jaipur',          'rss', 'https://www.hindustantimes.com/feeds/rss/cities/jaipur-news/rssfeed.xml',     'city'),
  ('IE · Jaipur',          'rss', 'https://indianexpress.com/section/cities/jaipur/feed/',                        'city'),

  -- ─── KOLKATA ─────────────────────────────────────────────────
  ('HT · Kolkata',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/kolkata-news/rssfeed.xml',    'city'),
  ('IE · Kolkata',         'rss', 'https://indianexpress.com/section/cities/kolkata/feed/',                       'city'),

  -- ─── PUNE ────────────────────────────────────────────────────
  ('HT · Pune',            'rss', 'https://www.hindustantimes.com/feeds/rss/cities/pune-news/rssfeed.xml',       'city'),
  ('IE · Pune',            'rss', 'https://indianexpress.com/section/cities/pune/feed/',                          'city'),

  -- ─── CHENNAI ─────────────────────────────────────────────────
  ('HT · Chennai',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/chennai-news/rssfeed.xml',    'city'),
  ('IE · Chennai',         'rss', 'https://indianexpress.com/section/cities/chennai/feed/',                       'city'),
  ('Hindu · Chennai',      'rss', 'https://www.thehindu.com/news/cities/chennai/feeder/default.rss',              'city'),

  -- ─── HYDERABAD ───────────────────────────────────────────────
  ('HT · Hyderabad',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/hyderabad-news/rssfeed.xml',  'city'),
  ('IE · Hyderabad',       'rss', 'https://indianexpress.com/section/cities/hyderabad/feed/',                     'city'),
  ('Hindu · Hyderabad',    'rss', 'https://www.thehindu.com/news/cities/Hyderabad/feeder/default.rss',            'city'),

  -- ─── AHMEDABAD ───────────────────────────────────────────────
  ('HT · Ahmedabad',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/ahmedabad-news/rssfeed.xml',  'city'),
  ('IE · Ahmedabad',       'rss', 'https://indianexpress.com/section/cities/ahmedabad/feed/',                     'city'),

  -- ─── LUCKNOW ─────────────────────────────────────────────────
  ('HT · Lucknow',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/lucknow-news/rssfeed.xml',    'city'),
  ('IE · Lucknow',         'rss', 'https://indianexpress.com/section/cities/lucknow/feed/',                       'city'),

  -- ─── BHOPAL ──────────────────────────────────────────────────
  ('HT · Bhopal',          'rss', 'https://www.hindustantimes.com/feeds/rss/cities/bhopal-news/rssfeed.xml',     'city'),

  -- ─── PATNA ───────────────────────────────────────────────────
  ('HT · Patna',           'rss', 'https://www.hindustantimes.com/feeds/rss/cities/patna-news/rssfeed.xml',      'city'),

  -- ─── CHANDIGARH ──────────────────────────────────────────────
  ('HT · Chandigarh',      'rss', 'https://www.hindustantimes.com/feeds/rss/cities/chandigarh-news/rssfeed.xml', 'city'),
  ('IE · Chandigarh',      'rss', 'https://indianexpress.com/section/cities/chandigarh/feed/',                    'city'),

  -- ─── KOCHI / KERALA ──────────────────────────────────────────
  ('Hindu · Kochi',        'rss', 'https://www.thehindu.com/news/cities/Kochi/feeder/default.rss',                'city'),

  -- ─── EXTRA NATIONAL HINDI HUBS ───────────────────────────────
  ('Hindu · Mumbai',       'rss', 'https://www.thehindu.com/news/cities/mumbai/feeder/default.rss',               'city'),
  ('Hindu · Delhi',        'rss', 'https://www.thehindu.com/news/cities/Delhi/feeder/default.rss',                'city'),
  ('Hindu · Bengaluru',    'rss', 'https://www.thehindu.com/news/cities/bangalore/feeder/default.rss',            'city')
on conflict (url) do nothing;


-- ─────────── 0010_more_hindi_and_cities.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- More Hindi sources + hyperlocal city coverage.
--
-- Hindi: Hindustan (Live Hindustan), Bhaskar regional editions,
-- Prabhat Khabar (Bihar/Jharkhand), Punjab Kesari, Inext, Naidunia.
--
-- Hyperlocal English: HT/IE pattern for tier-2 cities — Indore,
-- Surat, Nagpur, Kanpur, Visakhapatnam, Vadodara, Coimbatore,
-- Guwahati, Ranchi, Bhubaneswar, Raipur, Mysuru, Dehradun.
-- ═══════════════════════════════════════════════════════════════

insert into public.sources (name, source_type, url, desk) values
  -- ─── HINDI NATIONAL / LANGUAGE ───────────────────────────────
  ('Live Hindustan (हिंदुस्तान)',     'rss', 'https://www.livehindustan.com/rss/national',                         null),
  ('Prabhat Khabar (Bihar/Jharkhand)','rss', 'https://www.prabhatkhabar.com/rss',                                  null),
  ('Punjab Kesari (Hindi)',            'rss', 'https://www.punjabkesari.in/rss/recommended-news',                   null),
  ('Bhaskar — Rajasthan',              'rss', 'https://www.bhaskar.com/rss-v1--category-1061.xml',                  null),
  ('Bhaskar — Madhya Pradesh',         'rss', 'https://www.bhaskar.com/rss-v1--category-1064.xml',                  null),
  ('Bhaskar — National',               'rss', 'https://www.bhaskar.com/rss-v1--category-1300.xml',                  null),
  ('Bhaskar — Business',               'rss', 'https://www.bhaskar.com/rss-v1--category-1037.xml',                  'business'),
  ('Naidunia',                          'rss', 'https://naidunia.jagran.com/rss/news.xml',                          null),
  ('Aaj Tak — Live TV news',           'rss', 'https://www.aajtak.in/rssfeeds/?id=tv',                              null),
  ('Aaj Tak — Sports',                  'rss', 'https://www.aajtak.in/rssfeeds/?id=sports',                         'sports'),
  ('Amar Ujala — National',             'rss', 'https://www.amarujala.com/rss/national.xml',                        null),
  ('Amar Ujala — Business',             'rss', 'https://www.amarujala.com/rss/business.xml',                       'business'),
  ('Amar Ujala — Sports',               'rss', 'https://www.amarujala.com/rss/sports.xml',                          'sports'),

  -- ─── HYPERLOCAL TIER-2 CITIES (HT pattern) ───────────────────
  ('HT · Indore',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/indore-news/rssfeed.xml',           'city'),
  ('HT · Surat',          'rss', 'https://www.hindustantimes.com/feeds/rss/cities/surat-news/rssfeed.xml',            'city'),
  ('HT · Nagpur',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/nagpur-news/rssfeed.xml',           'city'),
  ('HT · Kanpur',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/kanpur-news/rssfeed.xml',           'city'),
  ('HT · Visakhapatnam',  'rss', 'https://www.hindustantimes.com/feeds/rss/cities/visakhapatnam-news/rssfeed.xml',    'city'),
  ('HT · Vadodara',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/vadodara-news/rssfeed.xml',         'city'),
  ('HT · Coimbatore',     'rss', 'https://www.hindustantimes.com/feeds/rss/cities/coimbatore-news/rssfeed.xml',       'city'),
  ('HT · Guwahati',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/guwahati-news/rssfeed.xml',         'city'),
  ('HT · Ranchi',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/ranchi-news/rssfeed.xml',           'city'),
  ('HT · Bhubaneswar',    'rss', 'https://www.hindustantimes.com/feeds/rss/cities/bhubaneswar-news/rssfeed.xml',      'city'),
  ('HT · Raipur',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/raipur-news/rssfeed.xml',           'city'),
  ('HT · Dehradun',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/dehradun-news/rssfeed.xml',         'city'),
  ('HT · Gurugram',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/gurgaon-news/rssfeed.xml',          'city'),
  ('HT · Noida',          'rss', 'https://www.hindustantimes.com/feeds/rss/cities/noida-news/rssfeed.xml',            'city'),

  -- ─── HYPERLOCAL (Indian Express where it exists) ─────────────
  ('IE · Indore',         'rss', 'https://indianexpress.com/section/cities/indore/feed/',     'city'),
  ('IE · Nagpur',         'rss', 'https://indianexpress.com/section/cities/nagpur/feed/',     'city'),
  ('IE · Surat',          'rss', 'https://indianexpress.com/section/cities/surat/feed/',      'city'),
  ('IE · Kanpur',         'rss', 'https://indianexpress.com/section/cities/kanpur/feed/',     'city'),
  ('IE · Guwahati',       'rss', 'https://indianexpress.com/section/cities/guwahati/feed/',   'city'),

  -- ─── HINDI HYPERLOCAL (Aaj Tak + Bhaskar) ────────────────────
  ('Aaj Tak — Delhi NCR',     'rss', 'https://www.aajtak.in/rssfeeds/?id=delhi-ncr',         'city'),
  ('Aaj Tak — UP',            'rss', 'https://www.aajtak.in/rssfeeds/?id=up',                'city'),
  ('Aaj Tak — Madhya Pradesh','rss', 'https://www.aajtak.in/rssfeeds/?id=madhya-pradesh',    'city'),
  ('Aaj Tak — Rajasthan',     'rss', 'https://www.aajtak.in/rssfeeds/?id=rajasthan',         'city'),
  ('Aaj Tak — Bihar',         'rss', 'https://www.aajtak.in/rssfeeds/?id=bihar',             'city'),
  ('Aaj Tak — Maharashtra',   'rss', 'https://www.aajtak.in/rssfeeds/?id=maharashtra',       'city')
on conflict (url) do nothing;


-- ─────────── 0011_trends_freshness.sql ───────────
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


-- ─────────── 0012_sources_sitemap_news.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Sources reboot: replace all current RSS/Twitter/Google-News sources
-- with 10 publisher sitemap-news.xml feeds.
--
-- Why: each publisher's sitemap-news.xml lists every article published in
-- the last 48 hours (typically 200-1500 items). RSS feeds expose only the
-- "latest" snapshot the publisher chose (typically 20-50 items). Sitemap
-- gives ~50x more material per fetch and a real backfill on first ingest.
--
-- All 10 URLs were verified at migration time:
--   • All return HTTP 200 with valid sitemap-news XML
--   • All contain <urlset xmlns:news="…/sitemap-news/0.9">
--   • Total ~6,200 article URLs available across the 10 in any 48h window
-- ═══════════════════════════════════════════════════════════════

-- 1. Add 'sitemap_news' to the source_type check constraint.
alter table public.sources
  drop constraint if exists sources_source_type_check;
alter table public.sources
  add constraint sources_source_type_check
    check (source_type in ('rss', 'twitter', 'google_news', 'sitemap_news'));

-- 2. Wipe existing sources. (Signals reference sources via ON DELETE CASCADE,
--    so we wipe signals first to avoid orphan references during the cascade.)
delete from public.signals;
delete from public.sources;

-- 3. Seed the 10 publisher sitemap-news feeds.
--    Mix of English mainstream + one Hindi (Aaj Tak) for bilingual coverage.
insert into public.sources (name, source_type, url, desk, is_active) values
  ('Times of India',    'sitemap_news', 'https://timesofindia.indiatimes.com/sitemap/today',                     'National',         true),
  ('Hindustan Times',   'sitemap_news', 'https://www.hindustantimes.com/sitemap/news.xml',                       'National',         true),
  ('Indian Express',    'sitemap_news', 'https://indianexpress.com/news-sitemap.xml',                            'National',         true),
  ('Mint',              'sitemap_news', 'https://www.livemint.com/sitemap/today.xml',                            'Business',         true),
  ('News18',            'sitemap_news', 'https://www.news18.com/commonfeeds/v1/eng/sitemap/google-news.xml',     'National',         true),
  ('Deccan Chronicle',  'sitemap_news', 'https://www.deccanchronicle.com/news-sitemap-daily.xml',                'National',         true),
  ('India Today',       'sitemap_news', 'https://www.indiatoday.in/news-it-sitemap.xml',                         'National',         true),
  ('Economic Times',    'sitemap_news', 'https://economictimes.indiatimes.com/sitemap/today',                    'Business',         true),
  ('The Wire',          'sitemap_news', 'https://thewire.in/news-sitemap.xml',                                   'National',         true),
  ('Aaj Tak',           'sitemap_news', 'https://www.aajtak.in/rssfeeds/news-sitemap.xml',                       'National · Hindi', true);


-- ─────────── 0013_style_module.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Style Module v2: editorial guidelines + sample articles.
--
-- Two assets the drafting AI uses on every article generation:
--   1. style_guidelines — singleton (one row, upserted). Long-form
--      Patrika editorial guidelines. Injected into the system prompt.
--   2. style_samples    — many rows. Each is one example Patrika article
--      with optional story_type tag. The drafting prompt picks 2-3
--      best-matched samples (by story_type) as few-shot exemplars.
--
-- Both tables hold raw text. Articles can be sourced from:
--   • Direct paste
--   • A URL (server fetches + Mozilla Readability extracts the body)
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.style_guidelines (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  notes text,
  updated_at timestamptz default now()
);

create table if not exists public.style_samples (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  -- Optional tag matching the AI's story-type taxonomy:
  --   'Breaking news' | 'Analysis' | 'Explainer' | 'Profile'
  --   | 'Service piece' | 'Investigation' | 'Op-ed' | 'Sidebar' | 'Feature'
  story_type text,
  source_url text,      -- if pasted from a URL, the original
  notes text,           -- editor's note about why this sample matters
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_style_samples_story_type
  on public.style_samples(story_type);
create index if not exists idx_style_samples_created
  on public.style_samples(created_at desc);


-- ─────────── 0014_source_categories.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Source categorisation — two orthogonal tags per source.
--
-- focus    — what the publisher specialises in. Most Indian whole-publisher
--            sitemaps cover everything → 'general'. Specialists get their
--            domain: 'business' (Mint, ET, Moneycontrol), 'magazine'
--            (The Wire, Caravan), 'regional' (Deccan Chronicle, Mathrubhumi).
--
-- language — primary language served. 'en' / 'hi' / 'bilingual'.
--
-- Why two tags: a single category collapses too much information. A
-- regional Hindi paper and a business-specialist English paper are very
-- different things even though both are non-general.
--
-- Used by:
--   • /sources page — group/filter sources visually
--   • Discovery service (Phase 2) — auto-tag adopted candidates
-- ═══════════════════════════════════════════════════════════════

alter table public.sources
  add column if not exists focus text default 'general',
  add column if not exists language text default 'en';

-- Constrain to known values. Future categories require migration to expand.
alter table public.sources
  drop constraint if exists sources_focus_check;
alter table public.sources
  add constraint sources_focus_check
    check (focus in (
      'general', 'business', 'tech', 'magazine',
      'regional', 'sports', 'entertainment'
    ));

alter table public.sources
  drop constraint if exists sources_language_check;
alter table public.sources
  add constraint sources_language_check
    check (language in ('en', 'hi', 'bilingual'));

-- Tag the 10 current publishers we have wired up.
update public.sources set focus = 'general',  language = 'en' where name = 'Times of India';
update public.sources set focus = 'general',  language = 'en' where name = 'Hindustan Times';
update public.sources set focus = 'general',  language = 'en' where name = 'Indian Express';
update public.sources set focus = 'business', language = 'en' where name = 'Mint';
update public.sources set focus = 'general',  language = 'en' where name = 'News18';
update public.sources set focus = 'regional', language = 'en' where name = 'Deccan Chronicle';
update public.sources set focus = 'general',  language = 'en' where name = 'India Today';
update public.sources set focus = 'business', language = 'en' where name = 'Economic Times';
update public.sources set focus = 'magazine', language = 'en' where name = 'The Wire';
update public.sources set focus = 'general',  language = 'hi' where name = 'Aaj Tak';

create index if not exists idx_sources_focus on public.sources(focus);
create index if not exists idx_sources_language on public.sources(language);


-- ─────────── 0015_source_discovery.sql ───────────
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


-- ─────────── 0016_google_news_topics.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Add Google News topic RSS feeds as a second-tier signal source.
--
-- Why: each topic feed (BUSINESS, SPORTS, etc.) returns 50-100 stories
-- curated by Google across publishers we may or may not track. Brings
-- breadth of coverage that publisher sitemaps can't match.
--
-- Mechanics:
--   • source_type = 'google_news' (already in the CHECK constraint since 0012)
--   • url = the topic-specific RSS feed
--   • The fetcher (lib/sources/google-news.ts) parses each item's
--     <source url="…"> attribute as the canonical article URL, NOT
--     the wrapped news.google.com link. That way the external_id is the
--     real publisher URL, and dedup works across both source paths
--     (Google News BUSINESS + TOI sitemap will dedup to one signal).
--
-- Categories — Indian-English variants for now. Add Hindi (hl=hi) later
-- if signal-volume math supports it.
-- ═══════════════════════════════════════════════════════════════

insert into public.sources (name, source_type, url, desk, focus, language, is_active) values
  ('Google News · India',          'google_news', 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en',                                                'India · Top stories',  'general',       'en', true),
  ('Google News · Business',       'google_news', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en',               'Business',             'business',      'en', true),
  ('Google News · Technology',     'google_news', 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en',             'Tech',                 'tech',          'en', true),
  ('Google News · Sports',         'google_news', 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en',                 'Sports',               'sports',        'en', true),
  ('Google News · Entertainment',  'google_news', 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-IN&gl=IN&ceid=IN:en',          'Entertainment',        'entertainment', 'en', true),
  ('Google News · Nation',         'google_news', 'https://news.google.com/rss/headlines/section/topic/NATION?hl=en-IN&gl=IN&ceid=IN:en',                 'National',             'general',       'en', true),
  ('Google News · World',          'google_news', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-IN&gl=IN&ceid=IN:en',                  'World',                'general',       'en', true),
  ('Google News · Science',        'google_news', 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-IN&gl=IN&ceid=IN:en',                'Science',              'general',       'en', true),
  ('Google News · Health',         'google_news', 'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en-IN&gl=IN&ceid=IN:en',                 'Health',               'general',       'en', true);


-- ─────────── 0017_final_source_list.sql ───────────
-- ═══════════════════════════════════════════════════════════════
-- Final source list: 39 hand-picked authoritative Indian publishers.
--
-- Wipes ALL existing data:
--   • signals (all today's articles)
--   • trends (all clusters)
--   • source_candidates (discovery queue cleared)
--   • trend_searches (discovery cache cleared)
--   • sources (all entries removed)
--
-- Then inserts exactly 39 verified-working sources, each with a feed URL
-- confirmed to return today's articles in the today-IST window.
--
-- IMPORTANT: Source discovery (Google News topic feed sweep + per-trend
-- search) is permanently disabled in the ingest pipeline (see comment in
-- lib/ingest/index.ts). These 39 are the only sources the system will
-- ever poll. To add or remove sources, edit this list and re-run the
-- migration — no auto-discovery.
-- ═══════════════════════════════════════════════════════════════

delete from public.signals;
delete from public.trends;
delete from public.source_candidates;
delete from public.trend_searches;
delete from public.sources;

-- ── ENGLISH NATIONAL (14) ─────────────────────────────────────
insert into public.sources (name, source_type, url, desk, focus, language, is_active) values
  ('The Hindu',          'sitemap_news', 'https://www.thehindu.com/sitemap/googlenews/all/all.xml',                              'National',          'general',  'en', true),
  ('Times of India',     'sitemap_news', 'https://timesofindia.indiatimes.com/sitemap/today',                                    'National',          'general',  'en', true),
  ('Hindustan Times',    'sitemap_news', 'https://www.hindustantimes.com/sitemap/news.xml',                                       'National',          'general',  'en', true),
  ('The Indian Express', 'sitemap_news', 'https://indianexpress.com/news-sitemap.xml',                                            'National',          'general',  'en', true),
  ('NDTV',               'rss',          'https://feeds.feedburner.com/ndtvnews-latest',                                          'National',          'general',  'en', true),
  ('News18',             'sitemap_news', 'https://www.news18.com/commonfeeds/v1/eng/sitemap/google-news.xml',                     'National',          'general',  'en', true),
  ('India Today',        'sitemap_news', 'https://www.indiatoday.in/news-it-sitemap.xml',                                         'National',          'general',  'en', true),
  ('The Print',          'sitemap_news', 'https://theprint.in/googlenews.xml',                                                   'National',          'general',  'en', true),
  ('The Wire',           'sitemap_news', 'https://thewire.in/news-sitemap.xml',                                                  'National',          'magazine', 'en', true),
  ('Scroll.in',          'sitemap_news', 'https://scroll.in/sitemap/news-sitemap.xml',                                           'National',          'general',  'en', true),
  ('Deccan Herald',      'sitemap_news', 'https://www.deccanherald.com/news_sitemap.xml',                                        'National · Karnataka', 'regional', 'en', true),
  ('The Tribune',        'sitemap_news', 'https://www.tribuneindia.com/sitemap-news.xml',                                        'National · North',  'regional', 'en', true),
  ('The Telegraph',      'sitemap_news', 'https://www.telegraphindia.com/news-sitemap.xml',                                      'National · East',   'regional', 'en', true),
  ('DNA India',          'sitemap_news', 'https://www.dnaindia.com/sitemap-news.xml',                                            'National',          'general',  'en', true);

-- ── ENGLISH BUSINESS (8) ──────────────────────────────────────
insert into public.sources (name, source_type, url, desk, focus, language, is_active) values
  ('Mint',               'sitemap_news', 'https://www.livemint.com/sitemap/today.xml',                                           'Business',          'business', 'en', true),
  ('The Economic Times', 'sitemap_news', 'https://economictimes.indiatimes.com/sitemap/today',                                   'Business',          'business', 'en', true),
  ('Business Standard',  'sitemap_news', 'https://www.business-standard.com/sitemap/news-sitemap.xml',                           'Business',          'business', 'en', true),
  ('Moneycontrol',       'sitemap_news', 'https://www.moneycontrol.com/news/news-sitemap.xml',                                   'Business · Markets', 'business', 'en', true),
  ('CNBC TV18',          'sitemap_news', 'https://www.cnbctv18.com/commonfeeds/v1/cne/sitemap/google-news.xml',                  'Business · Markets', 'business', 'en', true),
  ('Financial Express',  'sitemap_news', 'https://www.financialexpress.com/news-sitemap.xml',                                    'Business',          'business', 'en', true),
  ('Business Today',     'sitemap_news', 'https://www.businesstoday.in/news-sitemap.xml',                                        'Business',          'business', 'en', true),
  ('Forbes India',       'sitemap_news', 'https://www.forbesindia.com/commonfeeds/v1/frb/sitemap/google-news.xml',               'Business',          'business', 'en', true);

-- ── ENGLISH SPORTS (3) ────────────────────────────────────────
insert into public.sources (name, source_type, url, desk, focus, language, is_active) values
  ('ESPN Cricinfo',      'sitemap_news', 'https://www.espncricinfo.com/sitemap/news-sitemap.xml',                                'Sports · Cricket',  'sports',   'en', true),
  ('Sportstar',          'sitemap_news', 'https://sportstar.thehindu.com/sitemap/googlenews/all/all.xml',                       'Sports',            'sports',   'en', true),
  ('Sportskeeda',        'sitemap_news', 'https://www.sportskeeda.com/news-sitemap.xml',                                        'Sports',            'sports',   'en', true);

-- ── ENGLISH BROADCAST (3) ─────────────────────────────────────
insert into public.sources (name, source_type, url, desk, focus, language, is_active) values
  ('ABP Live',           'sitemap_news', 'https://www.abplive.com/google-news-sitemap.xml',                                     'National',          'general',  'en', true),
  ('Times Now',          'sitemap_news', 'https://www.timesnownews.com/google-news-sitemap-en.xml',                             'National',          'general',  'en', true),
  ('Republic World',     'sitemap_news', 'https://www.republicworld.com/sitemaps/sitemaps-news.xml',                            'National',          'general',  'en', true);

-- ── HINDI NATIONAL (11) ───────────────────────────────────────
insert into public.sources (name, source_type, url, desk, focus, language, is_active) values
  ('Aaj Tak',            'sitemap_news', 'https://www.aajtak.in/rssfeeds/news-sitemap.xml',                                     'राष्ट्रीय',          'general',  'hi', true),
  ('Dainik Jagran',      'sitemap_news', 'https://www.jagran.com/news-sitemap.xml',                                             'राष्ट्रीय',          'general',  'hi', true),
  ('Dainik Bhaskar',     'sitemap_news', 'https://www.bhaskar.com/sitemaps-v1--sitemap-google-news-index.xml',                  'राष्ट्रीय',          'general',  'hi', true),
  ('Amar Ujala',         'sitemap_news', 'https://www.amarujala.com/sitemap-news-v1.xml',                                       'राष्ट्रीय',          'general',  'hi', true),
  ('Rajasthan Patrika',  'sitemap_news', 'https://www.patrika.com/google-news-sitemap-v1.xml',                                  'राष्ट्रीय',          'general',  'hi', true),
  ('Hindustan (Hindi)',  'sitemap_news', 'https://www.livehindustan.com/news-sitemap.xml',                                      'राष्ट्रीय',          'general',  'hi', true),
  ('Navbharat Times',    'sitemap_news', 'https://navbharattimes.indiatimes.com/staticsitemap/nbt/news-sitemap.xml',             'राष्ट्रीय',          'general',  'hi', true),
  ('ABP News Hindi',     'sitemap_news', 'https://news.abplive.com/google-news-sitemap.xml',                                    'राष्ट्रीय',          'general',  'hi', true),
  ('Zee News Hindi',     'sitemap_news', 'https://zeenews.india.com/news-sitemap.xml',                                          'राष्ट्रीय',          'general',  'hi', true),
  ('News18 Hindi',       'sitemap_news', 'https://hindi.news18.com/allstory-sitemap-data.xml',                                  'राष्ट्रीय',          'general',  'hi', true),
  ('Jansatta',           'sitemap_news', 'https://www.jansatta.com/news-sitemap.xml',                                           'राष्ट्रीय',          'general',  'hi', true);


-- ─────────── 0018_phase2_clustering.sql ───────────
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


-- ─────────── 0019_jsonld_enrichment.sql ───────────
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


-- ─────────── 0020_pipeline_settings.sql ───────────
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


-- ─────────── 0021_no_ai_clustering.sql ───────────
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


