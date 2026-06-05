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
