-- 0026_story_angles.sql
-- AI-generated editorial angles, persisted per story. Generated on demand
-- (not for every story) and saved once, so we don't re-spend tokens on every
-- drawer open. Each angle = { id, title, summary, format }.
alter table public.trends
  add column if not exists angles jsonb,
  add column if not exists angles_at timestamptz;
