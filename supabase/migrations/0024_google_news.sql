-- ═══════════════════════════════════════════════════════════════
-- Google News topic + search feeds (source_type 'google_news').
-- Aggregates hundreds of publishers per category — a big boost to the
-- publisher diversity needed to hit the 3-source bar. fetchGoogleNews
-- (lib/sources/google-news.ts) extracts the real publisher from <source>.
-- ═══════════════════════════════════════════════════════════════

insert into public.sources (name, source_type, url, language, desk, focus, is_active) values
  ('Google News · India', 'google_news', 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · World', 'google_news', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'world', 'general', true),
  ('Google News · Nation', 'google_news', 'https://news.google.com/rss/headlines/section/topic/NATION?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Business', 'google_news', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'business', 'business', true),
  ('Google News · Technology', 'google_news', 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'tech', 'tech', true),
  ('Google News · Entertainment', 'google_news', 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'enter', 'entertainment', true),
  ('Google News · Sports', 'google_news', 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'sports', 'sports', true),
  ('Google News · Science', 'google_news', 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'tech', 'tech', true),
  ('Google News · Health', 'google_news', 'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Politics (IN)', 'google_news', 'https://news.google.com/rss/search?q=India%20politics%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'politics', 'general', true),
  ('Google News हिंदी', 'google_news', 'https://news.google.com/rss?hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'national', 'general', true)
on conflict (url) do nothing;
