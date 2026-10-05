-- Saved Quick Bytes (glanceable swipe stories). Generated as drafts, editable
-- later, and published to WordPress — the publish response's post id + URL are
-- stored back on the row.
CREATE TABLE IF NOT EXISTS quick_bytes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  magazine    text NOT NULL,                 -- Patrika+ desk key
  headline    text NOT NULL,
  cards       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{title, text}]
  slug        text,                          -- post slug sent to WordPress
  category    text,                          -- CMS category slug sent to WordPress
  status      text NOT NULL DEFAULT 'draft', -- draft | published | failed
  wp_post_id  text,
  wp_url      text,
  wp_error    text,
  created_by  uuid,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quick_bytes_updated_idx ON quick_bytes (updated_at DESC);
