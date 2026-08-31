-- Tracks EVERY Patrika+ idea the generator has already surfaced (not just the
-- ones turned into articles — that's used_ideas). The idea generator excludes
-- both so a topic is never shown twice for a desk. Additive; safe to re-run.
--
--   psql "$DATABASE_URL" -f deploy/generated-ideas.sql

CREATE TABLE IF NOT EXISTS generated_ideas (
  id            bigserial PRIMARY KEY,
  magazine      text        NOT NULL,        -- desk key, e.g. 'politics-power'
  filter        text,                        -- angle filter key, if any
  headline      text        NOT NULL,        -- the idea headline as shown
  headline_key  text        NOT NULL,        -- normalized headline for matching
  user_id       uuid,                        -- who generated it (nullable)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_ideas_magazine_key ON generated_ideas (magazine, headline_key);
CREATE INDEX IF NOT EXISTS generated_ideas_recent ON generated_ideas (magazine, created_at DESC);
