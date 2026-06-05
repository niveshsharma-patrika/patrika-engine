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
