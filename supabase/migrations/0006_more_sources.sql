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
