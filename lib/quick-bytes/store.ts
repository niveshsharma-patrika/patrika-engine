import { pool } from "@/lib/db";
import type { QuickByteCard } from "./wordpress";

export type QuickByteRow = {
  id: string;
  magazine: string;
  headline: string;
  cards: QuickByteCard[];
  slug: string | null;
  category: string | null;
  status: string; // draft | published | failed
  wp_post_id: string | null;
  wp_url: string | null;
  wp_error: string | null;
  updated_at: string | null;
  created_at: string | null;
};

const SELECT = "id, magazine, headline, cards, slug, category, status, wp_post_id, wp_url, wp_error, updated_at, created_at";

/** Save a freshly generated Quick Byte as a draft; returns its id. */
export async function createDraft(magazine: string, headline: string, cards: QuickByteCard[], userId: string | null): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO quick_bytes (magazine, headline, cards, created_by) VALUES ($1, $2, $3::jsonb, $4) RETURNING id`,
    [magazine, headline, JSON.stringify(cards), userId]
  );
  return rows[0].id;
}

export async function getById(id: string): Promise<QuickByteRow | null> {
  try {
    const { rows } = await pool.query<QuickByteRow>(`SELECT ${SELECT} FROM quick_bytes WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ?? null;
  } catch {
    return null; // e.g. a malformed (non-uuid) id → treat as not found
  }
}

/** Recent saved bytes, for the Saved list. */
export async function listRecent(limit = 60): Promise<QuickByteRow[]> {
  const { rows } = await pool.query<QuickByteRow>(
    `SELECT ${SELECT} FROM quick_bytes ORDER BY updated_at DESC LIMIT $1`,
    [Math.min(limit, 200)]
  );
  return rows;
}

/** Save edits to a byte's content. Editing always returns it to 'draft' — it no
 *  longer matches what's live (published) or the last attempt (failed) until it
 *  is published again. During publish this runs first, then markPublished/
 *  markFailed sets the final status. */
export async function updateContent(id: string, headline: string, cards: QuickByteCard[]): Promise<void> {
  await pool.query(
    `UPDATE quick_bytes SET headline = $2, cards = $3::jsonb, status = 'draft', wp_error = NULL, updated_at = now() WHERE id = $1`,
    [id, headline, JSON.stringify(cards)]
  );
}

/** Record the slug/category actually sent to WordPress. */
export async function updateMeta(id: string, slug: string | null, category: string | null): Promise<void> {
  await pool.query(`UPDATE quick_bytes SET slug = $2, category = $3, updated_at = now() WHERE id = $1`, [id, slug, category]);
}

export async function markPublished(id: string, wpPostId: string | null, wpUrl: string | null): Promise<void> {
  await pool.query(
    `UPDATE quick_bytes SET status = 'published', wp_post_id = $2, wp_url = $3, wp_error = NULL, updated_at = now() WHERE id = $1`,
    [id, wpPostId, wpUrl]
  );
}

export async function markFailed(id: string, error: string | null): Promise<void> {
  await pool.query(`UPDATE quick_bytes SET status = 'failed', wp_error = $2, updated_at = now() WHERE id = $1`, [id, error]);
}

export async function remove(id: string): Promise<void> {
  try {
    await pool.query(`DELETE FROM quick_bytes WHERE id = $1`, [id]);
  } catch {
    /* ignore (e.g. a malformed id) */
  }
}
