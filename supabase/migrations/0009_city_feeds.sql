-- ═══════════════════════════════════════════════════════════════
-- Hyperlocal city feeds — Jaipur, Kolkata, Pune, Chennai,
-- Hyderabad, Ahmedabad, Lucknow, Bhopal, Patna, Chandigarh, Kochi.
--
-- Three patterns used:
--   - Hindustan Times: cities/<city>-news/rssfeed.xml
--   - Indian Express : section/cities/<city>/feed/
--   - The Hindu      : news/cities/<city>/feeder/default.rss
--
-- All `desk='city'` so the section filter on the dashboard works.
-- ═══════════════════════════════════════════════════════════════

insert into public.sources (name, source_type, url, desk) values
  -- ─── JAIPUR (Patrika's home turf) ────────────────────────────
  ('HT · Jaipur',          'rss', 'https://www.hindustantimes.com/feeds/rss/cities/jaipur-news/rssfeed.xml',     'city'),
  ('IE · Jaipur',          'rss', 'https://indianexpress.com/section/cities/jaipur/feed/',                        'city'),

  -- ─── KOLKATA ─────────────────────────────────────────────────
  ('HT · Kolkata',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/kolkata-news/rssfeed.xml',    'city'),
  ('IE · Kolkata',         'rss', 'https://indianexpress.com/section/cities/kolkata/feed/',                       'city'),

  -- ─── PUNE ────────────────────────────────────────────────────
  ('HT · Pune',            'rss', 'https://www.hindustantimes.com/feeds/rss/cities/pune-news/rssfeed.xml',       'city'),
  ('IE · Pune',            'rss', 'https://indianexpress.com/section/cities/pune/feed/',                          'city'),

  -- ─── CHENNAI ─────────────────────────────────────────────────
  ('HT · Chennai',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/chennai-news/rssfeed.xml',    'city'),
  ('IE · Chennai',         'rss', 'https://indianexpress.com/section/cities/chennai/feed/',                       'city'),
  ('Hindu · Chennai',      'rss', 'https://www.thehindu.com/news/cities/chennai/feeder/default.rss',              'city'),

  -- ─── HYDERABAD ───────────────────────────────────────────────
  ('HT · Hyderabad',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/hyderabad-news/rssfeed.xml',  'city'),
  ('IE · Hyderabad',       'rss', 'https://indianexpress.com/section/cities/hyderabad/feed/',                     'city'),
  ('Hindu · Hyderabad',    'rss', 'https://www.thehindu.com/news/cities/Hyderabad/feeder/default.rss',            'city'),

  -- ─── AHMEDABAD ───────────────────────────────────────────────
  ('HT · Ahmedabad',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/ahmedabad-news/rssfeed.xml',  'city'),
  ('IE · Ahmedabad',       'rss', 'https://indianexpress.com/section/cities/ahmedabad/feed/',                     'city'),

  -- ─── LUCKNOW ─────────────────────────────────────────────────
  ('HT · Lucknow',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/lucknow-news/rssfeed.xml',    'city'),
  ('IE · Lucknow',         'rss', 'https://indianexpress.com/section/cities/lucknow/feed/',                       'city'),

  -- ─── BHOPAL ──────────────────────────────────────────────────
  ('HT · Bhopal',          'rss', 'https://www.hindustantimes.com/feeds/rss/cities/bhopal-news/rssfeed.xml',     'city'),

  -- ─── PATNA ───────────────────────────────────────────────────
  ('HT · Patna',           'rss', 'https://www.hindustantimes.com/feeds/rss/cities/patna-news/rssfeed.xml',      'city'),

  -- ─── CHANDIGARH ──────────────────────────────────────────────
  ('HT · Chandigarh',      'rss', 'https://www.hindustantimes.com/feeds/rss/cities/chandigarh-news/rssfeed.xml', 'city'),
  ('IE · Chandigarh',      'rss', 'https://indianexpress.com/section/cities/chandigarh/feed/',                    'city'),

  -- ─── KOCHI / KERALA ──────────────────────────────────────────
  ('Hindu · Kochi',        'rss', 'https://www.thehindu.com/news/cities/Kochi/feeder/default.rss',                'city'),

  -- ─── EXTRA NATIONAL HINDI HUBS ───────────────────────────────
  ('Hindu · Mumbai',       'rss', 'https://www.thehindu.com/news/cities/mumbai/feeder/default.rss',               'city'),
  ('Hindu · Delhi',        'rss', 'https://www.thehindu.com/news/cities/Delhi/feeder/default.rss',                'city'),
  ('Hindu · Bengaluru',    'rss', 'https://www.thehindu.com/news/cities/bangalore/feeder/default.rss',            'city')
on conflict (url) do nothing;
