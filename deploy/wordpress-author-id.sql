-- WordPress author id per user.
-- Sent as `author_id` in the payload when a user's Patrika+ article is saved to
-- WordPress, so the post is attributed to that person's byline on patrika.com.
-- Nullable: users without a WordPress author id simply don't send the field.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS author_id integer;
