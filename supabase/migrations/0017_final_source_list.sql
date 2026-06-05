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
