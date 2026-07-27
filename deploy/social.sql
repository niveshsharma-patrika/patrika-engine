-- Social command center — track competitor / agency pages across platforms,
-- pull their public posts + engagement, score virality, and feed the top
-- performers to an AI "what to post next" suggester.
--
-- ISOLATION: entirely separate from the news + Twitter-drafting pipelines.
-- Its own tables, own cron. Nothing here writes to signals/trends/drafts.
--
-- Platform data reality (why some platforms are richer than others):
--   youtube   — official Data API v3, free quota. Full public channel + video
--               stats. The reliable one.
--   x         — reuses the existing Scweet shim (per-post likes/rt/replies/views).
--   instagram — Meta Graph "business discovery": needs your OWN IG business
--               account + a Meta app token; returns public data for business/
--               creator competitor accounts only.
--   facebook  — no free API for competitor Page analytics (CrowdTangle is gone);
--               supported as manual entry only.
--
-- Idempotent; safe to re-run:
--   psql "$DATABASE_URL" -f deploy/social.sql
BEGIN;

CREATE TABLE IF NOT EXISTS social_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform       text NOT NULL,
  handle         text NOT NULL,            -- @name, channel handle, or page id
  external_id    text,                     -- resolved channel/user id once known
  display_name   text,
  kind           text NOT NULL DEFAULT 'competitor', -- competitor | agency | own
  is_active      boolean NOT NULL DEFAULT true,
  followers      integer,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_accounts_platform_check CHECK (platform = ANY (ARRAY[
    'youtube','x','instagram','facebook'])),
  CONSTRAINT social_accounts_kind_check CHECK (kind = ANY (ARRAY[
    'competitor','agency','own'])),
  CONSTRAINT social_accounts_unique UNIQUE (platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_active
  ON social_accounts (is_active, platform);

CREATE TABLE IF NOT EXISTS social_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform       text NOT NULL,
  post_id        text NOT NULL,
  url            text,
  content        text NOT NULL DEFAULT '',
  media_url      text,
  posted_at      timestamptz,
  likes          integer NOT NULL DEFAULT 0,
  comments       integer NOT NULL DEFAULT 0,
  shares         integer NOT NULL DEFAULT 0,  -- retweets / shares where available
  views          integer NOT NULL DEFAULT 0,
  -- engagement_rate = interactions / followers (%); virality_score is a 0-100
  -- index derived from it (see lib/social/score.ts). Both recomputed on sync.
  engagement     integer NOT NULL DEFAULT 0,
  engagement_rate numeric(8,4) NOT NULL DEFAULT 0,
  virality_score integer NOT NULL DEFAULT 0,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_posts_unique UNIQUE (account_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_viral
  ON social_posts (virality_score DESC, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_account
  ON social_posts (account_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_posted
  ON social_posts (posted_at DESC);

CREATE TABLE IF NOT EXISTS social_syncs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  trigger        text NOT NULL DEFAULT 'cron',
  accounts_ok    integer NOT NULL DEFAULT 0,
  accounts_failed integer NOT NULL DEFAULT 0,
  posts_upserted integer NOT NULL DEFAULT 0,
  duration_ms    integer,
  error          text
);

COMMIT;
