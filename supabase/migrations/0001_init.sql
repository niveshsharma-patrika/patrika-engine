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
