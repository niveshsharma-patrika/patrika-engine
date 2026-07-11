-- Per-user edition (Print vs Digital). Existing users default to 'digital'.
-- Run once on the target:  psql "$DATABASE_URL" -f deploy/editions.sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS edition text NOT NULL DEFAULT 'digital';
DO $$ BEGIN
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_edition_check CHECK (edition = ANY (ARRAY['print', 'digital']));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
