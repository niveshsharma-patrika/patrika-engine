import { pool } from "@/lib/db";

import { getTranslationApiKey, signBody } from "./config";
import { translateArticle, type SourceArticle, type TranslatedArticle } from "./translate";
import type { Flag } from "./checks";

/**
 * Translation job lifecycle. WordPress POSTs an article → a `queued` row; it is
 * translated right after the 202 response (next/server `after`), and the result
 * is POSTed to the callback URL, signed. The cron sweep (/api/cron/translate)
 * re-runs anything a restart interrupted and re-delivers failed callbacks, so
 * no article is lost.
 */

export type JobRow = {
  id: string;
  external_id: string;
  callback_url: string;
  status: "queued" | "processing" | "done" | "failed";
  review: "ok" | "needs_review" | null;
  source: SourceArticle;
  result: TranslatedArticle | null;
  flags: Flag[];
  model: string | null;
  error: string | null;
  attempts: number;
  callback_status: number | null;
  callback_attempts: number;
  callback_error: string | null;
  delivered_at: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const MAX_ATTEMPTS = 3;           // translation tries before the job is failed
const MAX_CALLBACK_ATTEMPTS = 12; // ≈ an hour of sweeps
const STALE_MINUTES = 15;         // a 'processing' job older than this was interrupted
const MAX_CONCURRENT = 3;         // translations running at once in this process

// Process-local limiter so a burst of articles doesn't hit the AI provider all
// at once; jobs past the limit wait their turn (and survive restarts as 'queued').
let running = 0;
const waiting: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}

export async function createJob(externalId: string, callbackUrl: string, source: SourceArticle): Promise<{ id: string; duplicate: boolean }> {
  // WordPress save hooks can fire repeatedly for one edit — reuse a recent job
  // for the identical article instead of paying for the same translation twice.
  const { rows: dup } = await pool.query<{ id: string }>(
    `SELECT id FROM translation_jobs
      WHERE external_id = $1 AND source = $2::jsonb AND callback_url = $3
        AND status <> 'failed' AND created_at > now() - interval '30 minutes'
      ORDER BY created_at DESC LIMIT 1`,
    [externalId, JSON.stringify(source), callbackUrl]
  );
  if (dup[0]) return { id: dup[0].id, duplicate: true };
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO translation_jobs (external_id, callback_url, source) VALUES ($1, $2, $3::jsonb) RETURNING id`,
    [externalId, callbackUrl, JSON.stringify(source)]
  );
  return { id: rows[0].id, duplicate: false };
}

export async function getJob(id: string): Promise<JobRow | null> {
  const { rows } = await pool.query<JobRow>(`SELECT * FROM translation_jobs WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Jobs created in the last minute (rate limiting). */
export async function recentJobCount(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM translation_jobs WHERE created_at > now() - interval '1 minute'`
  );
  return rows[0]?.n ?? 0;
}

/** Translate one job (if it is still claimable), then deliver the callback. */
export async function processJob(id: string): Promise<void> {
  await withSlot(async () => {
    // Atomic claim: only a queued job, or one stuck in 'processing' after a crash.
    const { rows } = await pool.query<JobRow>(
      `UPDATE translation_jobs SET status = 'processing', started_at = now(), attempts = attempts + 1
        WHERE id = $1 AND (status = 'queued' OR (status = 'processing' AND started_at < now() - ($2 || ' minutes')::interval))
        RETURNING *`,
      [id, String(STALE_MINUTES)]
    );
    const job = rows[0];
    if (!job) return;

    try {
      const out = await translateArticle(job.source);
      await pool.query(
        `UPDATE translation_jobs SET status = 'done', review = $2, result = $3::jsonb, flags = $4::jsonb,
                model = $5, error = NULL, completed_at = now()
          WHERE id = $1`,
        [id, out.review, JSON.stringify(out.result), JSON.stringify(out.flags), out.model]
      );
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      const final = job.attempts >= MAX_ATTEMPTS;
      await pool.query(
        `UPDATE translation_jobs SET status = $2, error = $3, completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END
          WHERE id = $1`,
        [id, final ? "failed" : "queued", msg]
      );
      if (!final) return; // the sweep retries it
    }
  });
  await deliverCallback(id);
}

/** The JSON body WordPress receives (also what GET /api/v1/translate/:id returns). */
export function publicView(job: JobRow) {
  return {
    job_id: job.id,
    id: job.external_id,
    status: job.status,
    review: job.review,
    flags: (job.flags ?? []).map((f) => ({ type: f.type, detail: f.detail })),
    translation: job.status === "done" ? job.result : null,
    error: job.status === "failed" ? job.error : null,
    model: job.model,
    created_at: job.created_at,
    completed_at: job.completed_at,
  };
}

/** POST the finished (or failed) job to WordPress, signed. Retries briefly; the sweep retries later. */
export async function deliverCallback(id: string): Promise<boolean> {
  const job = await getJob(id);
  if (!job || (job.status !== "done" && job.status !== "failed") || job.delivered_at) return Boolean(job?.delivered_at);
  const key = await getTranslationApiKey();
  if (!key) return false;

  const body = JSON.stringify({ ...publicView(job), sent_at: new Date().toISOString() });
  let status: number | null = null;
  let error: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(job.callback_url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Kairos-Signature": signBody(body, key), "X-Kairos-Job": job.id },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      status = res.status;
      if (res.ok) { error = null; break; }
      error = `WordPress returned ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
      if (res.status < 500 && res.status !== 429) break; // client error — retrying won't help now
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 200) : "callback failed";
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  const ok = error === null;
  await pool.query(
    `UPDATE translation_jobs SET callback_status = $2, callback_attempts = callback_attempts + 1,
            callback_error = $3, delivered_at = CASE WHEN $4 THEN now() ELSE NULL END
      WHERE id = $1`,
    [id, status, error, ok]
  );
  return ok;
}

/** Recovery sweep (cron): resume interrupted/queued jobs, re-deliver undelivered callbacks. */
export async function sweep(): Promise<{ resumed: number; redelivered: number }> {
  const { rows: pending } = await pool.query<{ id: string }>(
    `SELECT id FROM translation_jobs
      WHERE (status = 'queued' AND created_at < now() - interval '1 minute')
         OR (status = 'processing' AND started_at < now() - ($1 || ' minutes')::interval)
      ORDER BY created_at LIMIT 20`,
    [String(STALE_MINUTES)]
  );
  for (const r of pending) await processJob(r.id).catch(() => {});

  const { rows: undelivered } = await pool.query<{ id: string }>(
    `SELECT id FROM translation_jobs
      WHERE status IN ('done', 'failed') AND delivered_at IS NULL AND callback_attempts < $1
      ORDER BY completed_at LIMIT 50`,
    [MAX_CALLBACK_ATTEMPTS]
  );
  let redelivered = 0;
  for (const r of undelivered) if (await deliverCallback(r.id).catch(() => false)) redelivered++;
  return { resumed: pending.length, redelivered };
}

/** Admin: put a job back in the queue (fresh translation) or just resend its callback. */
export async function requeue(id: string): Promise<void> {
  await pool.query(
    `UPDATE translation_jobs SET status = 'queued', attempts = 0, review = NULL, result = NULL, flags = '[]'::jsonb,
            error = NULL, delivered_at = NULL, callback_attempts = 0, callback_error = NULL, completed_at = NULL
      WHERE id = $1`,
    [id]
  );
}

export async function resetCallback(id: string): Promise<void> {
  await pool.query(`UPDATE translation_jobs SET delivered_at = NULL, callback_attempts = 0, callback_error = NULL WHERE id = $1`, [id]);
}

export async function listJobs(limit: number, before?: string): Promise<JobRow[]> {
  const { rows } = await pool.query<JobRow>(
    `SELECT * FROM translation_jobs
      WHERE ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
      ORDER BY created_at DESC LIMIT $1`,
    [limit, before ?? null]
  );
  return rows;
}
