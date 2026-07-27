-- Social Trends — crawl social feeds for what's TRENDING (not our own news,
-- not specific competitor pages) and turn a trend into ready-to-post creatives.
-- Mirrors the news engine's shape: crawl → rank → click → generate.
--
-- Sources that work for free:
--   reddit — public JSON API (r/<sub>/hot|top). The reliable trending source.
--   x      — Scweet search for high-engagement recent tweets on a keyword/hashtag.
-- Meta (FB/IG) has no free trending API, so it is not a source here.
--
-- ISOLATION: own tables + own cron. Never touches news/Twitter/drafts.
--
-- Idempotent; safe to re-run:
--   psql "$DATABASE_URL" -f deploy/social-trends.sql
BEGIN;

-- What we crawl. For reddit, `query` is a subreddit; for x, a keyword/hashtag.
CREATE TABLE IF NOT EXISTS social_trend_sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform       text NOT NULL,
  query          text NOT NULL,
  label          text,
  is_active      boolean NOT NULL DEFAULT true,
  last_crawled_at timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_trend_sources_platform_check CHECK (platform = ANY (ARRAY['reddit','x'])),
  CONSTRAINT social_trend_sources_unique UNIQUE (platform, query)
);

-- Crawled trending items. Each is a trend candidate; ranked by heat at query time.
CREATE TABLE IF NOT EXISTS social_trend_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     uuid REFERENCES social_trend_sources(id) ON DELETE SET NULL,
  platform      text NOT NULL,
  external_id   text NOT NULL,
  title         text NOT NULL DEFAULT '',
  body          text NOT NULL DEFAULT '',
  url           text,
  permalink     text,           -- link to the discussion (reddit) / tweet
  thumbnail     text,
  author        text,
  origin        text,           -- subreddit name / search keyword
  score         integer NOT NULL DEFAULT 0,   -- upvotes / likes
  comments      integer NOT NULL DEFAULT 0,
  posted_at     timestamptz,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  -- Generated creative pack (jsonb) + when, so re-opening a trend shows it.
  generated     jsonb,
  generated_at  timestamptz,
  CONSTRAINT social_trend_items_unique UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_social_trend_items_fresh
  ON social_trend_items (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_trend_items_score
  ON social_trend_items (score DESC, posted_at DESC);

-- Sensible free defaults so the feature works the moment the cron runs. Reddit
-- only — X sources are user-added (they need the cookie + a chosen keyword).
INSERT INTO social_trend_sources (platform, query, label) VALUES
  ('reddit', 'india',       'r/india'),
  ('reddit', 'IndiaSpeaks', 'r/IndiaSpeaks'),
  ('reddit', 'worldnews',   'r/worldnews'),
  ('reddit', 'technology',  'r/technology'),
  ('reddit', 'Cricket',     'r/Cricket'),
  ('reddit', 'bollywood',   'r/bollywood')
ON CONFLICT (platform, query) DO NOTHING;

COMMIT;
