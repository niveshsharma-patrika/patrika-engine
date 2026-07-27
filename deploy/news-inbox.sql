-- News Inbox — reporters/staff submit news tips with photos; admins triage them
-- and can promote a tip into a draft. Separate from `feedback` (that is product
-- feedback; this is editorial submissions with their own workflow).
--
-- Attachments are stored inline as raster image data-URLs in a JSONB array,
-- same bounded approach as feedback (max count + size enforced in the API).
--
-- Idempotent; safe to re-run:
--   psql "$DATABASE_URL" -f deploy/news-inbox.sql
BEGIN;

CREATE TABLE IF NOT EXISTS news_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  headline      text NOT NULL,
  details       text NOT NULL DEFAULT '',
  location      text,
  category      text NOT NULL DEFAULT 'other',
  attachments   jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'new',
  -- Set when an admin promotes the tip into a newsroom draft.
  promoted_draft_id uuid REFERENCES drafts(id) ON DELETE SET NULL,
  promoted_at   timestamptz,
  promoted_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT news_submissions_category_check CHECK (category = ANY (ARRAY[
    'crime','politics','civic','business','sports','entertainment','health','education','other'])),
  CONSTRAINT news_submissions_status_check CHECK (status = ANY (ARRAY[
    'new','reviewed','promoted','dismissed']))
);

CREATE INDEX IF NOT EXISTS idx_news_submissions_created ON news_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_submissions_status  ON news_submissions (status, created_at DESC);

COMMIT;
