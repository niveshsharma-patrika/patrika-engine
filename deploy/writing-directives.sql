-- Writing Directives: per-(control, option) OVERRIDES for the generation
-- control prompts, edited from the /directives page. Built-in wording lives in
-- lib/ai/directives.ts; only customised rows land here. Run once on the target:
--   psql "$DATABASE_URL" -f deploy/writing-directives.sql
CREATE TABLE IF NOT EXISTS writing_directives (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control      text NOT NULL,
  option_value text NOT NULL,
  directive    text NOT NULL,
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (control, option_value)
);
