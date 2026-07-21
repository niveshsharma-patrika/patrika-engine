-- Twitter/X monitoring — Phase 2 (research + drafting).
--
-- ISOLATION unchanged: generated articles live in their OWN table. A row in
-- the newsroom `drafts` table is created ONLY when a human clicks
-- "Send to My Articles". Nothing automated ever writes to drafts.
--
-- Safe to re-run: additive only, no drops.
--
--   psql "$DATABASE_URL" -f deploy/twitter-phase2.sql

-- ── Generated articles (pre-newsroom) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS twitter_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id      uuid NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  language      text NOT NULL DEFAULT 'hi',
  word_count    integer NOT NULL DEFAULT 0,
  sources_used  integer NOT NULL DEFAULT 0,
  model         text,
  -- Set once an editor promotes it; points at the newsroom drafts row.
  promoted_draft_id uuid REFERENCES drafts(id) ON DELETE SET NULL,
  promoted_at   timestamptz,
  promoted_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT twitter_drafts_tweet_unique UNIQUE (tweet_id)
);

CREATE INDEX IF NOT EXISTS idx_twitter_drafts_created
  ON twitter_drafts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_twitter_drafts_pending
  ON twitter_drafts (promoted_at) WHERE promoted_at IS NULL;

-- ── Settings (spend guard) ────────────────────────────────────────────
-- Every tweet now triggers a web-search-grounded generation, which is the
-- expensive call. These caps exist so tweet volume can never quietly run up
-- an AI bill. Single-row table.
CREATE TABLE IF NOT EXISTS twitter_settings (
  id                  boolean PRIMARY KEY DEFAULT true,
  auto_draft          boolean NOT NULL DEFAULT true,
  daily_cap           integer NOT NULL DEFAULT 50,
  per_account_daily_cap integer NOT NULL DEFAULT 20,
  per_run_cap         integer NOT NULL DEFAULT 5,
  target_words        integer NOT NULL DEFAULT 500,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT twitter_settings_singleton CHECK (id)
);

INSERT INTO twitter_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Track why a tweet failed to draft, so the desk sees a reason not a silence.
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS draft_error text;
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS drafted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tweets_awaiting_draft
  ON tweets (posted_at DESC) WHERE status = 'new';
