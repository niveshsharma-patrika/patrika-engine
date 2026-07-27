-- Generation events — one row every time a user generates content, EVEN IF
-- they never save the draft. Powers the "Generated" count in the productivity
-- report (saved drafts alone under-count writers who generate and discard).
--
-- Idempotent; safe to re-run:
--   psql "$DATABASE_URL" -f deploy/generation-events.sql
BEGIN;

CREATE TABLE IF NOT EXISTS generation_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'article',  -- article | image | widget
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_events_user
  ON generation_events (user_id, created_at DESC);

COMMIT;
