-- Feedback: anyone signed in can submit; only admins can read it.
-- Attachments are stored inline as image data-URLs in a JSONB array (kept small
-- by the API — max 3 images, ~2 MB each). Idempotent; safe to re-run.
-- Run once on the target:  psql "$DATABASE_URL" -f deploy/feedback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category     text NOT NULL,
  message      text NOT NULL,
  attachments  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status       text NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_category_check CHECK (category = ANY (ARRAY['bug', 'feature', 'content', 'ui', 'other'])),
  CONSTRAINT feedback_status_check   CHECK (status = ANY (ARRAY['open', 'reviewed']))
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC);

COMMIT;
