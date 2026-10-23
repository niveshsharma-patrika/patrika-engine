-- Feature visibility flags (Admin → Features). One row per sidebar feature;
-- missing rows fall back to the code defaults in lib/features.ts.
--   enabled  : master on/off (off = hidden + blocked for everyone)
--   roles    : which roles see it (subset of the feature's default roles)
--   editions : which editions see it (subset of the feature's default editions)
CREATE TABLE IF NOT EXISTS feature_flags (
  feature_key text PRIMARY KEY,
  enabled     boolean     NOT NULL DEFAULT true,
  roles       text[]      NOT NULL DEFAULT '{}',
  editions    text[]      NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
