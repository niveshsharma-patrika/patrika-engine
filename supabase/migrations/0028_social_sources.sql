-- 0028_social_sources.sql
-- Social source types. reddit + youtube are fetched via their public RSS
-- (reuse the RSS fetcher); twitter is kept for a future RSS endpoint
-- (self-hosted Nitter / scraper that emits RSS). Social signals feed ONLY the
-- Social firehose tab — they're excluded from clustering so they never count
-- as a "publisher" toward the 3-source bar.
alter table public.sources
  drop constraint if exists sources_source_type_check;
alter table public.sources
  add constraint sources_source_type_check
    check (source_type in ('rss', 'twitter', 'google_news', 'sitemap_news', 'reddit', 'youtube'));
