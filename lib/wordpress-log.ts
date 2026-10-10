import { pool } from "@/lib/db";

/**
 * Audit log of Patrika+ article payloads sent to WordPress (table
 * wordpress_payloads, viewed in Admin → WordPress Payloads). Writing is
 * best-effort: a logging failure must never fail the actual save.
 */

export type WpPayloadRow = {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  magazine: string;
  title: string;
  categories: string[];
  payload: unknown;
  ok: boolean;
  status: number | null;
  wp_post_id: number | null;
  wp_link: string | null;
  error: string | null;
};

export async function logWordPressPayload(entry: {
  userId: string;
  userName: string;
  userEmail: string;
  magazine: string;
  title: string;
  categories: string[];
  payload: unknown;
  ok: boolean;
  status: number | null;
  wpPostId: number | null;
  wpLink: string | null;
  error: string | null;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO wordpress_payloads
         (user_id, user_name, user_email, magazine, title, categories, payload, ok, status, wp_post_id, wp_link, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)`,
      [
        entry.userId, entry.userName, entry.userEmail, entry.magazine, entry.title,
        entry.categories, JSON.stringify(entry.payload ?? null), entry.ok, entry.status,
        entry.wpPostId, entry.wpLink, entry.error,
      ]
    );
  } catch (e) {
    console.error("Failed to log WordPress payload:", e);
  }
}

/** Newest-first page of payload rows; pass the last row's id as `beforeId`. */
export async function listWordPressPayloads(limit: number, beforeId?: string): Promise<WpPayloadRow[]> {
  const lim = Math.max(1, Math.min(limit || 50, 200));
  const params: unknown[] = [];
  let where = "";
  if (beforeId && /^\d+$/.test(beforeId)) {
    params.push(beforeId);
    where = `WHERE id < $1`;
  }
  params.push(lim);
  try {
    const { rows } = await pool.query<WpPayloadRow>(
      `SELECT id, created_at, user_id, user_name, user_email, magazine, title, categories,
              payload, ok, status, wp_post_id, wp_link, error
         FROM wordpress_payloads ${where}
        ORDER BY id DESC LIMIT $${params.length}`,
      params
    );
    return rows;
  } catch {
    return [];
  }
}
