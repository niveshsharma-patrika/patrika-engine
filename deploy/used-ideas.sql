-- Tracks Patrika+ ideas that have already been turned into an article, so the
-- idea generator never surfaces the same topic twice for a desk.
-- Additive only — safe to run repeatedly.

CREATE TABLE IF NOT EXISTS used_ideas (
  id            bigserial PRIMARY KEY,
  magazine      text        NOT NULL,        -- desk key, e.g. 'politics-power'
  filter        text,                        -- angle filter key, if any
  headline      text        NOT NULL,        -- the idea headline the article was written from
  headline_key  text        NOT NULL,        -- normalized headline for matching
  user_id       uuid,                        -- who generated it (nullable)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS used_ideas_magazine_key ON used_ideas (magazine, headline_key);
CREATE INDEX IF NOT EXISTS used_ideas_recent ON used_ideas (magazine, created_at DESC);
