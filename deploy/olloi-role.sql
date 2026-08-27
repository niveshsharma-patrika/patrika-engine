-- Add the "olloi" user role — a restricted account that can only use the Olloi
-- Content section; every other section is locked. Widen profiles.role's CHECK
-- constraint to include 'olloi'. Additive + idempotent.
--
--   psql "$DATABASE_URL" -f deploy/olloi-role.sql
BEGIN;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'editor'::text, 'writer'::text, 'print'::text, 'olloi'::text]));

COMMIT;
