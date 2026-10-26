-- Hindi → English article translation API (POST /api/v1/translate).
-- One row per article sent by WordPress: the Hindi source, the English result,
-- the accuracy flags, and the callback delivery state. Idempotent; safe to re-run.
CREATE TABLE IF NOT EXISTS translation_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id        text NOT NULL DEFAULT '',      -- WordPress post id (as sent)
  callback_url       text NOT NULL,                 -- where the English is POSTed
  status             text NOT NULL DEFAULT 'queued', -- queued | processing | done | failed
  review             text,                          -- ok | needs_review (when done)
  source             jsonb NOT NULL,                -- { title, excerpt, content }
  result             jsonb,                         -- { title, excerpt, content, slug }
  flags              jsonb NOT NULL DEFAULT '[]',   -- [{ type, detail }]
  model              text,
  error              text,
  attempts           int NOT NULL DEFAULT 0,        -- translation attempts
  callback_status    int,                           -- last HTTP status from WordPress
  callback_attempts  int NOT NULL DEFAULT 0,
  callback_error     text,
  delivered_at       timestamptz,                   -- callback accepted (2xx)
  created_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  completed_at       timestamptz,
  CONSTRAINT translation_jobs_status_check CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  CONSTRAINT translation_jobs_review_check CHECK (review IS NULL OR review IN ('ok', 'needs_review'))
);
CREATE INDEX IF NOT EXISTS translation_jobs_created_idx ON translation_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS translation_jobs_external_idx ON translation_jobs (external_id);
-- The recovery sweep looks for unfinished work and undelivered callbacks.
CREATE INDEX IF NOT EXISTS translation_jobs_pending_idx ON translation_jobs (status, delivered_at)
  WHERE status IN ('queued', 'processing') OR delivered_at IS NULL;
