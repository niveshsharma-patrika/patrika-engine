-- More Google News feeds: Hindi topic editions + major-city search feeds.

insert into public.sources (name, source_type, url, language, desk, focus, is_active) values
  ('Google News हिंदी · World', 'google_news', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'world', 'general', true),
  ('Google News हिंदी · Business', 'google_news', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'business', 'business', true),
  ('Google News हिंदी · Sports', 'google_news', 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'sports', 'sports', true),
  ('Google News हिंदी · Entertainment', 'google_news', 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'enter', 'entertainment', true),
  ('Google News हिंदी · Technology', 'google_news', 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'tech', 'tech', true),
  ('Google News हिंदी · Nation', 'google_news', 'https://news.google.com/rss/headlines/section/topic/NATION?hl=hi-IN&gl=IN&ceid=IN:hi', 'hi', 'national', 'general', true),
  ('Google News · Mumbai', 'google_news', 'https://news.google.com/rss/search?q=Mumbai%20news%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Delhi', 'google_news', 'https://news.google.com/rss/search?q=Delhi%20news%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Bengaluru', 'google_news', 'https://news.google.com/rss/search?q=Bengaluru%20news%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Chennai', 'google_news', 'https://news.google.com/rss/search?q=Chennai%20news%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Kolkata', 'google_news', 'https://news.google.com/rss/search?q=Kolkata%20news%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Hyderabad', 'google_news', 'https://news.google.com/rss/search?q=Hyderabad%20news%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Pune', 'google_news', 'https://news.google.com/rss/search?q=Pune%20news%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Jaipur', 'google_news', 'https://news.google.com/rss/search?q=Jaipur%20news%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Lucknow', 'google_news', 'https://news.google.com/rss/search?q=Lucknow%20news%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true),
  ('Google News · Ahmedabad', 'google_news', 'https://news.google.com/rss/search?q=Ahmedabad%20news%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en', 'en', 'national', 'general', true)
on conflict (url) do nothing;
