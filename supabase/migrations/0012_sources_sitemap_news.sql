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
