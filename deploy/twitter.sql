-- Twitter/X monitoring — Phase 1 (crawl only).
--
-- ISOLATION: this feature is deliberately separate from the news pipeline.
-- Tweets do NOT go into `signals`, accounts do NOT go into `sources`, and
-- nothing here is read by clustering/trends. The only future touch-point with
-- newsroom tables is an explicit human "Send to My Articles" click (Phase 2),
-- which inserts a normal `drafts` row.
--
-- Safe to re-run: every statement is IF NOT EXISTS / additive. No drops.
--
--   psql "$DBURL" -f deploy/twitter.sql

-- ── Watched accounts ──────────────────────────────────────────────────
-- tier drives crawl frequency so we stay under X's scraping limits:
--   1 = every 5 min   (the tweet IS the news — PMO, ministers, big corporates)
--   2 = every 30 min
--   3 = every 120 min
CREATE TABLE IF NOT EXISTS twitter_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle              text NOT NULL,
  display_name        text,
  category            text NOT NULL DEFAULT 'figure',
  tier                smallint NOT NULL DEFAULT 2,
  desk                text,
  language            text NOT NULL DEFAULT 'hi',
  is_active           boolean NOT NULL DEFAULT true,
  last_crawled_at     timestamptz,
  last_tweet_id       text,
  consecutive_errors  integer NOT NULL DEFAULT 0,
  last_error          text,
  tweets_total        integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT twitter_accounts_handle_key UNIQUE (handle),
  CONSTRAINT twitter_accounts_category_check
    CHECK (category = ANY (ARRAY['figure','company','organisation','government','media'])),
  CONSTRAINT twitter_accounts_tier_check CHECK (tier BETWEEN 1 AND 3),
  CONSTRAINT twitter_accounts_language_check
    CHECK (language = ANY (ARRAY['en','hi']))
);

CREATE INDEX IF NOT EXISTS idx_twitter_accounts_due
  ON twitter_accounts (is_active, tier, last_crawled_at);

-- ── Crawled tweets ────────────────────────────────────────────────────
-- status:
--   new               — captured, awaiting Phase 2 drafting
--   skipped_retweet   — not the account's own words
--   nothing_to_write  — no substance (bare emoji / lone link / greeting).
--                       Still shown in the feed, never silently dropped.
--   drafted / failed  — set in Phase 2
CREATE TABLE IF NOT EXISTS tweets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES twitter_accounts(id) ON DELETE CASCADE,
  tweet_id      text NOT NULL,
  author_handle text NOT NULL,
  content       text NOT NULL DEFAULT '',
  url           text,
  posted_at     timestamptz NOT NULL,
  is_retweet    boolean NOT NULL DEFAULT false,
  is_reply      boolean NOT NULL DEFAULT false,
  metrics       jsonb NOT NULL DEFAULT '{}'::jsonb,
  media         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'new',
  status_reason text,
  crawled_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tweets_account_tweet_unique UNIQUE (account_id, tweet_id),
  CONSTRAINT tweets_status_check CHECK (status = ANY (
    ARRAY['new','skipped_retweet','nothing_to_write','queued','drafted','failed']))
);

CREATE INDEX IF NOT EXISTS idx_tweets_posted   ON tweets (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_status   ON tweets (status, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_account  ON tweets (account_id, posted_at DESC);

-- ── Crawl run health ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS twitter_crawls (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  trigger           text NOT NULL DEFAULT 'cron',
  accounts_due      integer NOT NULL DEFAULT 0,
  accounts_ok       integer NOT NULL DEFAULT 0,
  accounts_failed   integer NOT NULL DEFAULT 0,
  tweets_inserted   integer NOT NULL DEFAULT 0,
  duration_ms       integer,
  error             text
);

CREATE INDEX IF NOT EXISTS idx_twitter_crawls_started
  ON twitter_crawls (started_at DESC);

-- ── Encrypted integration secrets (the X auth_token cookie) ───────────
-- Encrypted with KEY_ENCRYPTION_SECRET via lib/crypto.ts, same scheme as the
-- AI provider keys. Editable from the admin UI so an expired cookie can be
-- refreshed without SSH — cookie expiry is the main operational failure mode.
CREATE TABLE IF NOT EXISTS integration_secrets (
  key             text PRIMARY KEY,
  value_encrypted text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
