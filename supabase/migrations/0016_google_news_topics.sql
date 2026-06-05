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
