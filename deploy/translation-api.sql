-- Hindi → English translation API (POST /api/v1/translate) — log of every
-- request: the Hindi received, the English returned, and the accuracy flags.
-- Shown in Admin → Translations. Idempotent; safe to re-run.

-- An earlier draft of this feature used a callback-based job table; it was
-- never used in production (only possible test rows), so it is removed.
DROP TABLE IF EXISTS translation_jobs;

CREATE TABLE IF NOT EXISTS translation_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status        text NOT NULL DEFAULT 'processing', -- processing | done | failed
  review        text,                               -- ok | needs_review (when done)
  source        jsonb NOT NULL,                     -- { title, excerpt, content } as received
  result        jsonb,                              -- { title, excerpt, content } as returned
  flags         jsonb NOT NULL DEFAULT '[]',        -- [{ type, detail }]
  model         text,
  error         text,
  duration_ms   int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  CONSTRAINT translation_log_status_check CHECK (status IN ('processing', 'done', 'failed')),
  CONSTRAINT translation_log_review_check CHECK (review IS NULL OR review IN ('ok', 'needs_review'))
);
CREATE INDEX IF NOT EXISTS translation_log_created_idx ON translation_log (created_at DESC);
