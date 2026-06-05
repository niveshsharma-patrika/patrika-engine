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
