-- Saved social posts — the desk's library of generated creative packs.
-- A generated post (from a News Trend or an Engagement/social trend) can be
-- saved here so it survives past the ephemeral generate step and shows up in
-- the Social Center's "Saved" tab for later posting.
--
-- ISOLATION: own table. Never touches news / drafts / trends.
--
-- Idempotent; safe to re-run:
--   psql "$DATABASE_URL" -f deploy/social-saved-posts.sql
BEGIN;

CREATE TABLE IF NOT EXISTS social_saved_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL,               -- 'news' | 'engagement'
  source_ref    text,                        -- originating trend / item id (informational)
  title         text NOT NULL DEFAULT '',    -- story / trend title for display
  lang          text NOT NULL DEFAULT 'hi',
  pack          jsonb NOT NULL,              -- the CreativePack (x/ig/fb/yt/hashtags/…)
  metrics       jsonb,                       -- the virality scorecard
  corroboration jsonb,                       -- Corroboration[] (trusted-media cross-check)
  image         text,                        -- optional data URL of a generated creative
  created_by    uuid,                        -- profiles.id of who saved it (nullable)
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_saved_posts_kind_check CHECK (kind = ANY (ARRAY['news','engagement']))
);

CREATE INDEX IF NOT EXISTS idx_social_saved_posts_recent
  ON social_saved_posts (created_at DESC);

COMMIT;
