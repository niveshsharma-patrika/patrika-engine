-- 0027_categorized_at.sql
-- Marks when a story's `section` was set by the AI categoriser, so we classify
-- each story ONCE (cheap) instead of re-running every tick. NULL = not yet
-- AI-categorised (still carries the lexical first guess).
alter table public.trends
  add column if not exists categorized_at timestamptz;
