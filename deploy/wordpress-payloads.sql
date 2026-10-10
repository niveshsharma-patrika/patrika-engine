-- Audit log of every Patrika+ article payload POSTed to WordPress
-- (Admin → WordPress Payloads). One row per send attempt, success or failure,
-- storing the exact JSON body plus the CMS response. Who-sent-it is denormalised
-- from the session so the log survives profile changes.
CREATE TABLE IF NOT EXISTS wordpress_payloads (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     text NOT NULL DEFAULT '',
  user_name   text NOT NULL DEFAULT '',
  user_email  text NOT NULL DEFAULT '',
  magazine    text NOT NULL DEFAULT '',   -- desk key
  title       text NOT NULL DEFAULT '',
  categories  text[] NOT NULL DEFAULT '{}', -- the category slugs sent
  payload     jsonb NOT NULL,              -- the exact JSON body POSTed
  ok          boolean NOT NULL DEFAULT false,
  status      integer,                     -- HTTP status from WordPress
  wp_post_id  bigint,                      -- created post id, if returned
  wp_link     text,                        -- post link, if returned
  error       text                         -- error message, if it failed
);
CREATE INDEX IF NOT EXISTS wordpress_payloads_created_idx ON wordpress_payloads (id DESC);
