-- Twitter/X monitoring — Phase 3 (per-tweet, on-demand drafting).
--
-- The desk now writes articles by pressing "Write article" on an individual
-- tweet, rather than a batch job deciding. Automatic drafting is therefore
-- switched OFF: if it kept running every 15 minutes it would write articles
-- before anyone could choose, making the button pointless.
--
-- To go back to automatic writing, either flip this back to true here or use
-- the switch in Twitter → Settings:
--   UPDATE twitter_settings SET auto_draft = true;
--
-- The daily / per-account / per-run caps still apply either way — they are a
-- budget guard, not an editorial rule.
--
-- Safe to re-run.
--
--   psql "$DATABASE_URL" -f deploy/twitter-phase3.sql

UPDATE twitter_settings SET auto_draft = false, updated_at = now() WHERE id = true;
