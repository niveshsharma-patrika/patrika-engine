-- Admin-selected AI provider routing: which provider/model handles content
-- (text) generation vs image generation. Keys still live in ai_providers
-- (Admin → API Keys). Idempotent; safe to re-run.
-- Run once on the target:  psql "$DATABASE_URL" -f deploy/ai-routing.sql
BEGIN;

CREATE TABLE IF NOT EXISTS ai_routing (
  purpose    text PRIMARY KEY,          -- 'content' | 'image'
  provider   text NOT NULL,             -- 'openai' | 'anthropic' | 'groq' | 'google'
  model      text,                      -- optional model override (else provider default)
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_routing_purpose_check CHECK (purpose = ANY (ARRAY['content', 'image']))
);

COMMIT;
