-- News Inbox — allow ANONYMOUS submissions so /submit can be a shareable,
-- standalone form sent to reporters/stringers/public who have no Kairos login.
--
-- submitter_id becomes nullable; a name (and optional contact) identify an
-- anonymous submitter instead. Signed-in submissions still record submitter_id.
--
-- Idempotent; safe to re-run:
--   psql "$DATABASE_URL" -f deploy/news-inbox-public.sql
BEGIN;

ALTER TABLE news_submissions ALTER COLUMN submitter_id DROP NOT NULL;
ALTER TABLE news_submissions ADD COLUMN IF NOT EXISTS submitter_name    text;
ALTER TABLE news_submissions ADD COLUMN IF NOT EXISTS submitter_contact text;

COMMIT;
