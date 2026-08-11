-- Allow Instagram as a Social Trends source platform.
-- social_trend_sources.platform had a CHECK constraint locked to ('reddit','x');
-- widen it to include 'instagram' so IG news handles can be crawled.
-- Additive + idempotent.

ALTER TABLE social_trend_sources
  DROP CONSTRAINT IF EXISTS social_trend_sources_platform_check;

ALTER TABLE social_trend_sources
  ADD CONSTRAINT social_trend_sources_platform_check
  CHECK (platform = ANY (ARRAY['reddit', 'x', 'instagram']));
