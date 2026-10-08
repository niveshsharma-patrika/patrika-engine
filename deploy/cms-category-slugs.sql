-- CMS category slugs per Patrika+ desk. Set in Admin → Category Mapping.
--   slug    = the Patrika GLOBAL/topical category (e.g. politics-news). Quick
--             Bytes sends this; Patrika+ sends it too.
--   pp_slug = the Patrika PLUS category for the desk (e.g. satta-ki-zameen).
--             Patrika+ sends both [pp_slug, slug] as its category array.
CREATE TABLE IF NOT EXISTS cms_category_slugs (
  desk_key   text PRIMARY KEY,
  slug       text NOT NULL DEFAULT '',
  pp_slug    text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);
-- Upgrade a table created before pp_slug existed.
ALTER TABLE cms_category_slugs ADD COLUMN IF NOT EXISTS pp_slug text NOT NULL DEFAULT '';
