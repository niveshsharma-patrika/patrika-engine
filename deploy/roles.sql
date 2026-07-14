-- Collapse roles to admin / editor / writer, remap existing users, re-check.
-- Atomic + idempotent: the whole thing runs in one transaction, so if any step
-- fails (e.g. a stray role value the CHECK rejects) it ALL rolls back and the
-- live table is left untouched. Safe to re-run.
-- Run once on the target:  psql "$DATABASE_URL" -f deploy/roles.sql
BEGIN;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
UPDATE profiles SET role = 'editor' WHERE role = 'desk_head';
UPDATE profiles SET role = 'writer' WHERE role IN ('sub_editor', 'reporter');
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'writer';
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['admin', 'editor', 'writer']));

-- Per-user, per-day image-generation log for role quotas (editor 5/day, writer 1/day).
CREATE TABLE IF NOT EXISTS image_generations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_image_gen_user ON image_generations (user_id, created_at DESC);

COMMIT;
