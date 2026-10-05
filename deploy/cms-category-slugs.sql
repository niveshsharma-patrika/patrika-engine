-- CMS category slug per Patrika+ desk. Set in Admin → Category Mapping and sent
-- as the `category` field when publishing (Quick Bytes now; Patrika+ reuses the
-- same mapping later). One slug per desk.
CREATE TABLE IF NOT EXISTS cms_category_slugs (
  desk_key   text PRIMARY KEY,
  slug       text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);
