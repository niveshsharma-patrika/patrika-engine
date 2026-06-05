-- ═══════════════════════════════════════════════════════════════
-- Bilingual support: store Hindi translations alongside English
-- for trends. UI toggle picks language at render time.
-- ═══════════════════════════════════════════════════════════════

alter table public.trends
  add column if not exists title_hi text,
  add column if not exists desk_hi text,
  add column if not exists suggested_angle_hi text;

-- Also useful: language metadata for the original title (mostly 'en' from our RSS feeds)
alter table public.trends
  add column if not exists primary_lang text default 'en';
