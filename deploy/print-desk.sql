-- Print desk foundation: print-scoped sources + city master list + print drafts.
-- Idempotent; safe to re-run.

-- 1) Sources get a surface scope + a city (print local feeds are tied to a city).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'shared';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS city  text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sources_scope_check') THEN
    ALTER TABLE sources ADD CONSTRAINT sources_scope_check CHECK (scope IN ('shared','digital','print'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_sources_scope_city ON sources (scope, city);
-- Ingest dedups incoming article URLs per side (print vs shared) — index the lookup.
CREATE INDEX IF NOT EXISTS idx_signals_url ON signals (url);

-- 2) The cities / editions the print desk covers (bilingual).
CREATE TABLE IF NOT EXISTS print_cities (
  key      text PRIMARY KEY,
  name_en  text NOT NULL,
  name_hi  text NOT NULL,
  region   text NOT NULL DEFAULT 'rajasthan',  -- rajasthan | metro
  active   boolean NOT NULL DEFAULT true,
  sort     integer NOT NULL DEFAULT 0
);
INSERT INTO print_cities (key, name_en, name_hi, region, sort) VALUES
  ('jaipur', 'Jaipur', 'जयपुर', 'rajasthan', 0),
  ('jodhpur', 'Jodhpur', 'जोधपुर', 'rajasthan', 1),
  ('udaipur', 'Udaipur', 'उदयपुर', 'rajasthan', 2),
  ('kota', 'Kota', 'कोटा', 'rajasthan', 3),
  ('ajmer', 'Ajmer', 'अजमेर', 'rajasthan', 4),
  ('bikaner', 'Bikaner', 'बीकानेर', 'rajasthan', 5),
  ('alwar', 'Alwar', 'अलवर', 'rajasthan', 6),
  ('bharatpur', 'Bharatpur', 'भरतपुर', 'rajasthan', 7),
  ('bhilwara', 'Bhilwara', 'भीलवाड़ा', 'rajasthan', 8),
  ('sikar', 'Sikar', 'सीकर', 'rajasthan', 9),
  ('pali', 'Pali', 'पाली', 'rajasthan', 10),
  ('jhunjhunu', 'Jhunjhunu', 'झुंझुनूं', 'rajasthan', 11),
  ('nagaur', 'Nagaur', 'नागौर', 'rajasthan', 12),
  ('churu', 'Churu', 'चूरू', 'rajasthan', 13),
  ('sri-ganganagar', 'Sri Ganganagar', 'श्रीगंगानगर', 'rajasthan', 14),
  ('hanumangarh', 'Hanumangarh', 'हनुमानगढ़', 'rajasthan', 15),
  ('barmer', 'Barmer', 'बाड़मेर', 'rajasthan', 16),
  ('jaisalmer', 'Jaisalmer', 'जैसलमेर', 'rajasthan', 17),
  ('jalore', 'Jalore', 'जालोर', 'rajasthan', 18),
  ('sirohi', 'Sirohi', 'सिरोही', 'rajasthan', 19),
  ('dungarpur', 'Dungarpur', 'डूंगरपुर', 'rajasthan', 20),
  ('banswara', 'Banswara', 'बांसवाड़ा', 'rajasthan', 21),
  ('chittorgarh', 'Chittorgarh', 'चित्तौड़गढ़', 'rajasthan', 22),
  ('pratapgarh', 'Pratapgarh', 'प्रतापगढ़', 'rajasthan', 23),
  ('rajsamand', 'Rajsamand', 'राजसमंद', 'rajasthan', 24),
  ('bundi', 'Bundi', 'बूंदी', 'rajasthan', 25),
  ('baran', 'Baran', 'बारां', 'rajasthan', 26),
  ('jhalawar', 'Jhalawar', 'झालावाड़', 'rajasthan', 27),
  ('tonk', 'Tonk', 'टोंक', 'rajasthan', 28),
  ('sawai-madhopur', 'Sawai Madhopur', 'सवाई माधोपुर', 'rajasthan', 29),
  ('karauli', 'Karauli', 'करौली', 'rajasthan', 30),
  ('dausa', 'Dausa', 'दौसा', 'rajasthan', 31),
  ('dholpur', 'Dholpur', 'धौलपुर', 'rajasthan', 32),
  ('balotra', 'Balotra', 'बालोतरा', 'rajasthan', 33),
  ('beawar', 'Beawar', 'ब्यावर', 'rajasthan', 34),
  ('phalodi', 'Phalodi', 'फलोदी', 'rajasthan', 35),
  ('kotputli', 'Kotputli', 'कोटपूतली', 'rajasthan', 36),
  ('deeg', 'Deeg', 'डीग', 'rajasthan', 37),
  ('gangapur-city', 'Gangapur City', 'गंगापुर सिटी', 'rajasthan', 38),
  ('neem-ka-thana', 'Neem Ka Thana', 'नीम का थाना', 'rajasthan', 39),
  ('delhi', 'Delhi', 'दिल्ली', 'metro', 40),
  ('mumbai', 'Mumbai', 'मुंबई', 'metro', 41),
  ('bengaluru', 'Bengaluru', 'बेंगलुरु', 'metro', 42),
  ('kolkata', 'Kolkata', 'कोलकाता', 'metro', 43),
  ('chennai', 'Chennai', 'चेन्नई', 'metro', 44),
  ('hyderabad', 'Hyderabad', 'हैदराबाद', 'metro', 45),
  ('pune', 'Pune', 'पुणे', 'metro', 46),
  ('ahmedabad', 'Ahmedabad', 'अहमदाबाद', 'metro', 47),
  ('indore', 'Indore', 'इंदौर', 'metro', 48),
  ('bhopal', 'Bhopal', 'भोपाल', 'metro', 49),
  ('lucknow', 'Lucknow', 'लखनऊ', 'metro', 50),
  ('chandigarh', 'Chandigarh', 'चंडीगढ़', 'metro', 51),
  ('gwalior', 'Gwalior', 'ग्वालियर', 'metro', 52),
  ('raipur', 'Raipur', 'रायपुर', 'metro', 53),
  ('patna', 'Patna', 'पटना', 'metro', 54),
  ('surat', 'Surat', 'सूरत', 'metro', 55),
  ('nagpur', 'Nagpur', 'नागपुर', 'metro', 56),
  ('dehradun', 'Dehradun', 'देहरादून', 'metro', 57)
ON CONFLICT (key) DO NOTHING;

-- 3) Print drafts: which surface, which city/edition, optional assignee.
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS surface     text NOT NULL DEFAULT 'digital';
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS city        text;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS assigned_to uuid;
CREATE INDEX IF NOT EXISTS idx_drafts_surface_status ON drafts (surface, status);

-- 4) Print settings (e.g. the Hindi print writing directive).
CREATE TABLE IF NOT EXISTS print_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO print_settings (key, value) VALUES ('directive', '') ON CONFLICT (key) DO NOTHING;

-- 5) Print LOCAL sources: per city, Google News in Hindi + English. Google News
--    aggregates many publications per query, so each city gets local news from
--    many papers. scope=print, city=<key>; they flow through the normal ingest.
--    The English query is the exact city name ("Jaipur" when:1d) — distinct from
--    the digital desk's "<City> news" feeds, whose URLs are UNIQUE in sources.
INSERT INTO sources (name, source_type, url, language, desk, focus, is_active, scope, city) VALUES
  ('Local · Jaipur (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9C%E0%A4%AF%E0%A4%AA%E0%A5%81%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Jaipur', 'regional', true, 'print', 'jaipur'),
  ('Local · Jaipur (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Jaipur%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Jaipur', 'regional', true, 'print', 'jaipur'),
  ('Local · Jodhpur (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9C%E0%A5%8B%E0%A4%A7%E0%A4%AA%E0%A5%81%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Jodhpur', 'regional', true, 'print', 'jodhpur'),
  ('Local · Jodhpur (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Jodhpur%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Jodhpur', 'regional', true, 'print', 'jodhpur'),
  ('Local · Udaipur (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%89%E0%A4%A6%E0%A4%AF%E0%A4%AA%E0%A5%81%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Udaipur', 'regional', true, 'print', 'udaipur'),
  ('Local · Udaipur (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Udaipur%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Udaipur', 'regional', true, 'print', 'udaipur'),
  ('Local · Kota (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%95%E0%A5%8B%E0%A4%9F%E0%A4%BE%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Kota', 'regional', true, 'print', 'kota'),
  ('Local · Kota (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Kota%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Kota', 'regional', true, 'print', 'kota'),
  ('Local · Ajmer (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%85%E0%A4%9C%E0%A4%AE%E0%A5%87%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Ajmer', 'regional', true, 'print', 'ajmer'),
  ('Local · Ajmer (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Ajmer%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Ajmer', 'regional', true, 'print', 'ajmer'),
  ('Local · Bikaner (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AC%E0%A5%80%E0%A4%95%E0%A4%BE%E0%A4%A8%E0%A5%87%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Bikaner', 'regional', true, 'print', 'bikaner'),
  ('Local · Bikaner (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Bikaner%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Bikaner', 'regional', true, 'print', 'bikaner'),
  ('Local · Alwar (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%85%E0%A4%B2%E0%A4%B5%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Alwar', 'regional', true, 'print', 'alwar'),
  ('Local · Alwar (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Alwar%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Alwar', 'regional', true, 'print', 'alwar'),
  ('Local · Bharatpur (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AD%E0%A4%B0%E0%A4%A4%E0%A4%AA%E0%A5%81%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Bharatpur', 'regional', true, 'print', 'bharatpur'),
  ('Local · Bharatpur (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Bharatpur%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Bharatpur', 'regional', true, 'print', 'bharatpur'),
  ('Local · Bhilwara (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AD%E0%A5%80%E0%A4%B2%E0%A4%B5%E0%A4%BE%E0%A4%A1%E0%A4%BC%E0%A4%BE%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Bhilwara', 'regional', true, 'print', 'bhilwara'),
  ('Local · Bhilwara (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Bhilwara%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Bhilwara', 'regional', true, 'print', 'bhilwara'),
  ('Local · Sikar (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%B8%E0%A5%80%E0%A4%95%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Sikar', 'regional', true, 'print', 'sikar'),
  ('Local · Sikar (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Sikar%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Sikar', 'regional', true, 'print', 'sikar'),
  ('Local · Pali (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AA%E0%A4%BE%E0%A4%B2%E0%A5%80%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Pali', 'regional', true, 'print', 'pali'),
  ('Local · Pali (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Pali%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Pali', 'regional', true, 'print', 'pali'),
  ('Local · Jhunjhunu (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9D%E0%A5%81%E0%A4%82%E0%A4%9D%E0%A5%81%E0%A4%A8%E0%A5%82%E0%A4%82%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Jhunjhunu', 'regional', true, 'print', 'jhunjhunu'),
  ('Local · Jhunjhunu (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Jhunjhunu%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Jhunjhunu', 'regional', true, 'print', 'jhunjhunu'),
  ('Local · Nagaur (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%A8%E0%A4%BE%E0%A4%97%E0%A5%8C%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Nagaur', 'regional', true, 'print', 'nagaur'),
  ('Local · Nagaur (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Nagaur%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Nagaur', 'regional', true, 'print', 'nagaur'),
  ('Local · Churu (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9A%E0%A5%82%E0%A4%B0%E0%A5%82%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Churu', 'regional', true, 'print', 'churu'),
  ('Local · Churu (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Churu%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Churu', 'regional', true, 'print', 'churu'),
  ('Local · Sri Ganganagar (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%B6%E0%A5%8D%E0%A4%B0%E0%A5%80%E0%A4%97%E0%A4%82%E0%A4%97%E0%A4%BE%E0%A4%A8%E0%A4%97%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Sri Ganganagar', 'regional', true, 'print', 'sri-ganganagar'),
  ('Local · Sri Ganganagar (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Sri%20Ganganagar%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Sri Ganganagar', 'regional', true, 'print', 'sri-ganganagar'),
  ('Local · Hanumangarh (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%B9%E0%A4%A8%E0%A5%81%E0%A4%AE%E0%A4%BE%E0%A4%A8%E0%A4%97%E0%A4%A2%E0%A4%BC%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Hanumangarh', 'regional', true, 'print', 'hanumangarh'),
  ('Local · Hanumangarh (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Hanumangarh%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Hanumangarh', 'regional', true, 'print', 'hanumangarh'),
  ('Local · Barmer (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AC%E0%A4%BE%E0%A4%A1%E0%A4%BC%E0%A4%AE%E0%A5%87%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Barmer', 'regional', true, 'print', 'barmer'),
  ('Local · Barmer (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Barmer%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Barmer', 'regional', true, 'print', 'barmer'),
  ('Local · Jaisalmer (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9C%E0%A5%88%E0%A4%B8%E0%A4%B2%E0%A4%AE%E0%A5%87%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Jaisalmer', 'regional', true, 'print', 'jaisalmer'),
  ('Local · Jaisalmer (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Jaisalmer%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Jaisalmer', 'regional', true, 'print', 'jaisalmer'),
  ('Local · Jalore (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9C%E0%A4%BE%E0%A4%B2%E0%A5%8B%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Jalore', 'regional', true, 'print', 'jalore'),
  ('Local · Jalore (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Jalore%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Jalore', 'regional', true, 'print', 'jalore'),
  ('Local · Sirohi (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%B8%E0%A4%BF%E0%A4%B0%E0%A5%8B%E0%A4%B9%E0%A5%80%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Sirohi', 'regional', true, 'print', 'sirohi'),
  ('Local · Sirohi (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Sirohi%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Sirohi', 'regional', true, 'print', 'sirohi'),
  ('Local · Dungarpur (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%A1%E0%A5%82%E0%A4%82%E0%A4%97%E0%A4%B0%E0%A4%AA%E0%A5%81%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Dungarpur', 'regional', true, 'print', 'dungarpur'),
  ('Local · Dungarpur (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Dungarpur%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Dungarpur', 'regional', true, 'print', 'dungarpur'),
  ('Local · Banswara (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AC%E0%A4%BE%E0%A4%82%E0%A4%B8%E0%A4%B5%E0%A4%BE%E0%A4%A1%E0%A4%BC%E0%A4%BE%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Banswara', 'regional', true, 'print', 'banswara'),
  ('Local · Banswara (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Banswara%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Banswara', 'regional', true, 'print', 'banswara'),
  ('Local · Chittorgarh (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9A%E0%A4%BF%E0%A4%A4%E0%A5%8D%E0%A4%A4%E0%A5%8C%E0%A4%A1%E0%A4%BC%E0%A4%97%E0%A4%A2%E0%A4%BC%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Chittorgarh', 'regional', true, 'print', 'chittorgarh'),
  ('Local · Chittorgarh (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Chittorgarh%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Chittorgarh', 'regional', true, 'print', 'chittorgarh'),
  ('Local · Pratapgarh (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%A4%E0%A4%BE%E0%A4%AA%E0%A4%97%E0%A4%A2%E0%A4%BC%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Pratapgarh', 'regional', true, 'print', 'pratapgarh'),
  ('Local · Pratapgarh (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Pratapgarh%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Pratapgarh', 'regional', true, 'print', 'pratapgarh'),
  ('Local · Rajsamand (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%B0%E0%A4%BE%E0%A4%9C%E0%A4%B8%E0%A4%AE%E0%A4%82%E0%A4%A6%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Rajsamand', 'regional', true, 'print', 'rajsamand'),
  ('Local · Rajsamand (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Rajsamand%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Rajsamand', 'regional', true, 'print', 'rajsamand'),
  ('Local · Bundi (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AC%E0%A5%82%E0%A4%82%E0%A4%A6%E0%A5%80%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Bundi', 'regional', true, 'print', 'bundi'),
  ('Local · Bundi (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Bundi%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Bundi', 'regional', true, 'print', 'bundi'),
  ('Local · Baran (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AC%E0%A4%BE%E0%A4%B0%E0%A4%BE%E0%A4%82%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Baran', 'regional', true, 'print', 'baran'),
  ('Local · Baran (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Baran%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Baran', 'regional', true, 'print', 'baran'),
  ('Local · Jhalawar (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9D%E0%A4%BE%E0%A4%B2%E0%A4%BE%E0%A4%B5%E0%A4%BE%E0%A4%A1%E0%A4%BC%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Jhalawar', 'regional', true, 'print', 'jhalawar'),
  ('Local · Jhalawar (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Jhalawar%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Jhalawar', 'regional', true, 'print', 'jhalawar'),
  ('Local · Tonk (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9F%E0%A5%8B%E0%A4%82%E0%A4%95%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Tonk', 'regional', true, 'print', 'tonk'),
  ('Local · Tonk (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Tonk%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Tonk', 'regional', true, 'print', 'tonk'),
  ('Local · Sawai Madhopur (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%B8%E0%A4%B5%E0%A4%BE%E0%A4%88%20%E0%A4%AE%E0%A4%BE%E0%A4%A7%E0%A5%8B%E0%A4%AA%E0%A5%81%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Sawai Madhopur', 'regional', true, 'print', 'sawai-madhopur'),
  ('Local · Sawai Madhopur (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Sawai%20Madhopur%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Sawai Madhopur', 'regional', true, 'print', 'sawai-madhopur'),
  ('Local · Karauli (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%95%E0%A4%B0%E0%A5%8C%E0%A4%B2%E0%A5%80%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Karauli', 'regional', true, 'print', 'karauli'),
  ('Local · Karauli (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Karauli%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Karauli', 'regional', true, 'print', 'karauli'),
  ('Local · Dausa (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%A6%E0%A5%8C%E0%A4%B8%E0%A4%BE%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Dausa', 'regional', true, 'print', 'dausa'),
  ('Local · Dausa (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Dausa%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Dausa', 'regional', true, 'print', 'dausa'),
  ('Local · Dholpur (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%A7%E0%A5%8C%E0%A4%B2%E0%A4%AA%E0%A5%81%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Dholpur', 'regional', true, 'print', 'dholpur'),
  ('Local · Dholpur (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Dholpur%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Dholpur', 'regional', true, 'print', 'dholpur'),
  ('Local · Balotra (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AC%E0%A4%BE%E0%A4%B2%E0%A5%8B%E0%A4%A4%E0%A4%B0%E0%A4%BE%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Balotra', 'regional', true, 'print', 'balotra'),
  ('Local · Balotra (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Balotra%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Balotra', 'regional', true, 'print', 'balotra'),
  ('Local · Beawar (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AC%E0%A5%8D%E0%A4%AF%E0%A4%BE%E0%A4%B5%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Beawar', 'regional', true, 'print', 'beawar'),
  ('Local · Beawar (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Beawar%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Beawar', 'regional', true, 'print', 'beawar'),
  ('Local · Phalodi (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AB%E0%A4%B2%E0%A5%8B%E0%A4%A6%E0%A5%80%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Phalodi', 'regional', true, 'print', 'phalodi'),
  ('Local · Phalodi (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Phalodi%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Phalodi', 'regional', true, 'print', 'phalodi'),
  ('Local · Kotputli (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%95%E0%A5%8B%E0%A4%9F%E0%A4%AA%E0%A5%82%E0%A4%A4%E0%A4%B2%E0%A5%80%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Kotputli', 'regional', true, 'print', 'kotputli'),
  ('Local · Kotputli (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Kotputli%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Kotputli', 'regional', true, 'print', 'kotputli'),
  ('Local · Deeg (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%A1%E0%A5%80%E0%A4%97%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Deeg', 'regional', true, 'print', 'deeg'),
  ('Local · Deeg (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Deeg%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Deeg', 'regional', true, 'print', 'deeg'),
  ('Local · Gangapur City (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%97%E0%A4%82%E0%A4%97%E0%A4%BE%E0%A4%AA%E0%A5%81%E0%A4%B0%20%E0%A4%B8%E0%A4%BF%E0%A4%9F%E0%A5%80%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Gangapur City', 'regional', true, 'print', 'gangapur-city'),
  ('Local · Gangapur City (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Gangapur%20City%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Gangapur City', 'regional', true, 'print', 'gangapur-city'),
  ('Local · Neem Ka Thana (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%A8%E0%A5%80%E0%A4%AE%20%E0%A4%95%E0%A4%BE%20%E0%A4%A5%E0%A4%BE%E0%A4%A8%E0%A4%BE%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Neem Ka Thana', 'regional', true, 'print', 'neem-ka-thana'),
  ('Local · Neem Ka Thana (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Neem%20Ka%20Thana%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Neem Ka Thana', 'regional', true, 'print', 'neem-ka-thana'),
  ('Local · Delhi (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%A6%E0%A4%BF%E0%A4%B2%E0%A5%8D%E0%A4%B2%E0%A5%80%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Delhi', 'regional', true, 'print', 'delhi'),
  ('Local · Delhi (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Delhi%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Delhi', 'regional', true, 'print', 'delhi'),
  ('Local · Mumbai (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AE%E0%A5%81%E0%A4%82%E0%A4%AC%E0%A4%88%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Mumbai', 'regional', true, 'print', 'mumbai'),
  ('Local · Mumbai (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Mumbai%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Mumbai', 'regional', true, 'print', 'mumbai'),
  ('Local · Bengaluru (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AC%E0%A5%87%E0%A4%82%E0%A4%97%E0%A4%B2%E0%A5%81%E0%A4%B0%E0%A5%81%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Bengaluru', 'regional', true, 'print', 'bengaluru'),
  ('Local · Bengaluru (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Bengaluru%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Bengaluru', 'regional', true, 'print', 'bengaluru'),
  ('Local · Kolkata (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%95%E0%A5%8B%E0%A4%B2%E0%A4%95%E0%A4%BE%E0%A4%A4%E0%A4%BE%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Kolkata', 'regional', true, 'print', 'kolkata'),
  ('Local · Kolkata (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Kolkata%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Kolkata', 'regional', true, 'print', 'kolkata'),
  ('Local · Chennai (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9A%E0%A5%87%E0%A4%A8%E0%A5%8D%E0%A4%A8%E0%A4%88%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Chennai', 'regional', true, 'print', 'chennai'),
  ('Local · Chennai (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Chennai%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Chennai', 'regional', true, 'print', 'chennai'),
  ('Local · Hyderabad (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%B9%E0%A5%88%E0%A4%A6%E0%A4%B0%E0%A4%BE%E0%A4%AC%E0%A4%BE%E0%A4%A6%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Hyderabad', 'regional', true, 'print', 'hyderabad'),
  ('Local · Hyderabad (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Hyderabad%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Hyderabad', 'regional', true, 'print', 'hyderabad'),
  ('Local · Pune (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AA%E0%A5%81%E0%A4%A3%E0%A5%87%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Pune', 'regional', true, 'print', 'pune'),
  ('Local · Pune (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Pune%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Pune', 'regional', true, 'print', 'pune'),
  ('Local · Ahmedabad (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%85%E0%A4%B9%E0%A4%AE%E0%A4%A6%E0%A4%BE%E0%A4%AC%E0%A4%BE%E0%A4%A6%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Ahmedabad', 'regional', true, 'print', 'ahmedabad'),
  ('Local · Ahmedabad (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Ahmedabad%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Ahmedabad', 'regional', true, 'print', 'ahmedabad'),
  ('Local · Indore (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%87%E0%A4%82%E0%A4%A6%E0%A5%8C%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Indore', 'regional', true, 'print', 'indore'),
  ('Local · Indore (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Indore%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Indore', 'regional', true, 'print', 'indore'),
  ('Local · Bhopal (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AD%E0%A5%8B%E0%A4%AA%E0%A4%BE%E0%A4%B2%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Bhopal', 'regional', true, 'print', 'bhopal'),
  ('Local · Bhopal (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Bhopal%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Bhopal', 'regional', true, 'print', 'bhopal'),
  ('Local · Lucknow (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%B2%E0%A4%96%E0%A4%A8%E0%A4%8A%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Lucknow', 'regional', true, 'print', 'lucknow'),
  ('Local · Lucknow (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Lucknow%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Lucknow', 'regional', true, 'print', 'lucknow'),
  ('Local · Chandigarh (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%9A%E0%A4%82%E0%A4%A1%E0%A5%80%E0%A4%97%E0%A4%A2%E0%A4%BC%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Chandigarh', 'regional', true, 'print', 'chandigarh'),
  ('Local · Chandigarh (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Chandigarh%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Chandigarh', 'regional', true, 'print', 'chandigarh'),
  ('Local · Gwalior (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%97%E0%A5%8D%E0%A4%B5%E0%A4%BE%E0%A4%B2%E0%A4%BF%E0%A4%AF%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Gwalior', 'regional', true, 'print', 'gwalior'),
  ('Local · Gwalior (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Gwalior%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Gwalior', 'regional', true, 'print', 'gwalior'),
  ('Local · Raipur (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%B0%E0%A4%BE%E0%A4%AF%E0%A4%AA%E0%A5%81%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Raipur', 'regional', true, 'print', 'raipur'),
  ('Local · Raipur (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Raipur%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Raipur', 'regional', true, 'print', 'raipur'),
  ('Local · Patna (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%AA%E0%A4%9F%E0%A4%A8%E0%A4%BE%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Patna', 'regional', true, 'print', 'patna'),
  ('Local · Patna (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Patna%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Patna', 'regional', true, 'print', 'patna'),
  ('Local · Surat (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%B8%E0%A5%82%E0%A4%B0%E0%A4%A4%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Surat', 'regional', true, 'print', 'surat'),
  ('Local · Surat (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Surat%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Surat', 'regional', true, 'print', 'surat'),
  ('Local · Nagpur (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%A8%E0%A4%BE%E0%A4%97%E0%A4%AA%E0%A5%81%E0%A4%B0%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Nagpur', 'regional', true, 'print', 'nagpur'),
  ('Local · Nagpur (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Nagpur%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Nagpur', 'regional', true, 'print', 'nagpur'),
  ('Local · Dehradun (हिंदी)', 'google_news', 'https://news.google.com/rss/search?q=%E0%A4%A6%E0%A5%87%E0%A4%B9%E0%A4%B0%E0%A4%BE%E0%A4%A6%E0%A5%82%E0%A4%A8%20%E0%A4%B8%E0%A4%AE%E0%A4%BE%E0%A4%9A%E0%A4%BE%E0%A4%B0%20when%3A1d&hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'Local · Dehradun', 'regional', true, 'print', 'dehradun'),
  ('Local · Dehradun (English)', 'google_news', 'https://news.google.com/rss/search?q=%22Dehradun%22%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'Local · Dehradun', 'regional', true, 'print', 'dehradun')
ON CONFLICT (url) DO NOTHING;
