-- ═══════════════════════════════════════════════════════════════
-- More Hindi sources + hyperlocal city coverage.
--
-- Hindi: Hindustan (Live Hindustan), Bhaskar regional editions,
-- Prabhat Khabar (Bihar/Jharkhand), Punjab Kesari, Inext, Naidunia.
--
-- Hyperlocal English: HT/IE pattern for tier-2 cities — Indore,
-- Surat, Nagpur, Kanpur, Visakhapatnam, Vadodara, Coimbatore,
-- Guwahati, Ranchi, Bhubaneswar, Raipur, Mysuru, Dehradun.
-- ═══════════════════════════════════════════════════════════════

insert into public.sources (name, source_type, url, desk) values
  -- ─── HINDI NATIONAL / LANGUAGE ───────────────────────────────
  ('Live Hindustan (हिंदुस्तान)',     'rss', 'https://www.livehindustan.com/rss/national',                         null),
  ('Prabhat Khabar (Bihar/Jharkhand)','rss', 'https://www.prabhatkhabar.com/rss',                                  null),
  ('Punjab Kesari (Hindi)',            'rss', 'https://www.punjabkesari.in/rss/recommended-news',                   null),
  ('Bhaskar — Rajasthan',              'rss', 'https://www.bhaskar.com/rss-v1--category-1061.xml',                  null),
  ('Bhaskar — Madhya Pradesh',         'rss', 'https://www.bhaskar.com/rss-v1--category-1064.xml',                  null),
  ('Bhaskar — National',               'rss', 'https://www.bhaskar.com/rss-v1--category-1300.xml',                  null),
  ('Bhaskar — Business',               'rss', 'https://www.bhaskar.com/rss-v1--category-1037.xml',                  'business'),
  ('Naidunia',                          'rss', 'https://naidunia.jagran.com/rss/news.xml',                          null),
  ('Aaj Tak — Live TV news',           'rss', 'https://www.aajtak.in/rssfeeds/?id=tv',                              null),
  ('Aaj Tak — Sports',                  'rss', 'https://www.aajtak.in/rssfeeds/?id=sports',                         'sports'),
  ('Amar Ujala — National',             'rss', 'https://www.amarujala.com/rss/national.xml',                        null),
  ('Amar Ujala — Business',             'rss', 'https://www.amarujala.com/rss/business.xml',                       'business'),
  ('Amar Ujala — Sports',               'rss', 'https://www.amarujala.com/rss/sports.xml',                          'sports'),

  -- ─── HYPERLOCAL TIER-2 CITIES (HT pattern) ───────────────────
  ('HT · Indore',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/indore-news/rssfeed.xml',           'city'),
  ('HT · Surat',          'rss', 'https://www.hindustantimes.com/feeds/rss/cities/surat-news/rssfeed.xml',            'city'),
  ('HT · Nagpur',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/nagpur-news/rssfeed.xml',           'city'),
  ('HT · Kanpur',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/kanpur-news/rssfeed.xml',           'city'),
  ('HT · Visakhapatnam',  'rss', 'https://www.hindustantimes.com/feeds/rss/cities/visakhapatnam-news/rssfeed.xml',    'city'),
  ('HT · Vadodara',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/vadodara-news/rssfeed.xml',         'city'),
  ('HT · Coimbatore',     'rss', 'https://www.hindustantimes.com/feeds/rss/cities/coimbatore-news/rssfeed.xml',       'city'),
  ('HT · Guwahati',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/guwahati-news/rssfeed.xml',         'city'),
  ('HT · Ranchi',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/ranchi-news/rssfeed.xml',           'city'),
  ('HT · Bhubaneswar',    'rss', 'https://www.hindustantimes.com/feeds/rss/cities/bhubaneswar-news/rssfeed.xml',      'city'),
  ('HT · Raipur',         'rss', 'https://www.hindustantimes.com/feeds/rss/cities/raipur-news/rssfeed.xml',           'city'),
  ('HT · Dehradun',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/dehradun-news/rssfeed.xml',         'city'),
  ('HT · Gurugram',       'rss', 'https://www.hindustantimes.com/feeds/rss/cities/gurgaon-news/rssfeed.xml',          'city'),
  ('HT · Noida',          'rss', 'https://www.hindustantimes.com/feeds/rss/cities/noida-news/rssfeed.xml',            'city'),

  -- ─── HYPERLOCAL (Indian Express where it exists) ─────────────
  ('IE · Indore',         'rss', 'https://indianexpress.com/section/cities/indore/feed/',     'city'),
  ('IE · Nagpur',         'rss', 'https://indianexpress.com/section/cities/nagpur/feed/',     'city'),
  ('IE · Surat',          'rss', 'https://indianexpress.com/section/cities/surat/feed/',      'city'),
  ('IE · Kanpur',         'rss', 'https://indianexpress.com/section/cities/kanpur/feed/',     'city'),
  ('IE · Guwahati',       'rss', 'https://indianexpress.com/section/cities/guwahati/feed/',   'city'),

  -- ─── HINDI HYPERLOCAL (Aaj Tak + Bhaskar) ────────────────────
  ('Aaj Tak — Delhi NCR',     'rss', 'https://www.aajtak.in/rssfeeds/?id=delhi-ncr',         'city'),
  ('Aaj Tak — UP',            'rss', 'https://www.aajtak.in/rssfeeds/?id=up',                'city'),
  ('Aaj Tak — Madhya Pradesh','rss', 'https://www.aajtak.in/rssfeeds/?id=madhya-pradesh',    'city'),
  ('Aaj Tak — Rajasthan',     'rss', 'https://www.aajtak.in/rssfeeds/?id=rajasthan',         'city'),
  ('Aaj Tak — Bihar',         'rss', 'https://www.aajtak.in/rssfeeds/?id=bihar',             'city'),
  ('Aaj Tak — Maharashtra',   'rss', 'https://www.aajtak.in/rssfeeds/?id=maharashtra',       'city')
on conflict (url) do nothing;
