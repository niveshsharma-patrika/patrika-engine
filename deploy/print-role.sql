-- Add the "print" user role — a restricted account that can only use the
-- Content Generator; every other section is locked. profiles.role has a CHECK
-- constraint locked to ('admin','editor','writer'); widen it to include 'print'.
-- Additive + idempotent.
--
--   psql "$DATABASE_URL" -f deploy/print-role.sql
BEGIN;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'editor'::text, 'writer'::text, 'print'::text]));

COMMIT;
