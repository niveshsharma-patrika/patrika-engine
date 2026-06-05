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
