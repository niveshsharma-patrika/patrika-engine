import { pool } from "@/lib/db";

import type { Flag } from "./checks";
import type { SourceArticle, TranslatedArticle } from "./translate";

/** Log of every translation request (Admin → Translations). */

export type LogRow = {
  id: string;
  status: "processing" | "done" | "failed";
  review: "ok" | "needs_review" | null;
  source: SourceArticle;
  result: TranslatedArticle | null;
  flags: Flag[];
  model: string | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
};

export async function startLog(source: SourceArticle): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO translation_log (source) VALUES ($1::jsonb) RETURNING id`,
      [JSON.stringify(source)]
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error("[translate] log insert failed", err); // logging must never block a translation
    return null;
  }
}

export async function finishLog(id: string | null, result: TranslatedArticle, flags: Flag[], model: string, ms: number): Promise<void> {
  if (!id) return;
  await pool.query(
    `UPDATE translation_log SET status = 'done', result = $2::jsonb, flags = $3::jsonb,
            review = CASE WHEN jsonb_array_length($3::jsonb) > 0 THEN 'needs_review' ELSE 'ok' END,
            model = $4, duration_ms = $5, completed_at = now()
      WHERE id = $1`,
    [id, JSON.stringify(result), JSON.stringify(flags), model, ms]
  ).catch((err) => console.error("[translate] log update failed", err));
}

export async function failLog(id: string | null, error: string, ms: number): Promise<void> {
  if (!id) return;
  await pool.query(
    `UPDATE translation_log SET status = 'failed', error = $2, duration_ms = $3, completed_at = now() WHERE id = $1`,
    [id, error.slice(0, 500), ms]
  ).catch((err) => console.error("[translate] log update failed", err));
}

/** Add the (post-response) AI review's findings to a logged translation. */
export async function appendFlags(id: string | null, extra: Flag[]): Promise<void> {
  if (!id || extra.length === 0) return;
  await pool.query(
    `UPDATE translation_log SET flags = flags || $2::jsonb, review = 'needs_review' WHERE id = $1`,
    [id, JSON.stringify(extra)]
  ).catch((err) => console.error("[translate] log update failed", err));
}

export async function getLog(id: string): Promise<LogRow | null> {
  const { rows } = await pool.query<LogRow>(`SELECT * FROM translation_log WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listLogs(limit: number, before?: string): Promise<LogRow[]> {
  const { rows } = await pool.query<LogRow>(
    `SELECT * FROM translation_log
      WHERE ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
      ORDER BY created_at DESC LIMIT $1`,
    [limit, before ?? null]
  );
  return rows;
}

/** Requests in the last minute (rate limiting). */
export async function recentCount(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM translation_log WHERE created_at > now() - interval '1 minute'`
  );
  return rows[0]?.n ?? 0;
}
