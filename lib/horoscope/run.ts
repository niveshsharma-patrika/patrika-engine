import { pool } from "@/lib/db";

import { generateHoroscopes, type HoroscopeEntry } from "./generate";
import { pushHoroscopes } from "./wordpress";
import { SIGNS } from "./signs";

export type HoroscopeRow = {
  sign: string;
  forecast: string;
  shubh_rang: string;
  shubh_ank: string;
  shubh_samay: string;
  wp_status: string;
  wp_post_id: string | null;
  wp_error: string | null;
  updated_at: string | null;
};

/** Current date (YYYY-MM-DD) in IST — the day a midnight-IST run is FOR. */
export function istDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** The 12 rows for a date, in canonical sign order (or fewer if not generated). */
export async function getEntriesForDate(forDate: string): Promise<HoroscopeRow[]> {
  const { rows } = await pool.query<HoroscopeRow>(
    `SELECT sign, forecast, shubh_rang, shubh_ank, shubh_samay, wp_status, wp_post_id, wp_error, updated_at
       FROM horoscopes WHERE for_date = $1`,
    [forDate]
  );
  const bySign = new Map(rows.map((r) => [r.sign, r]));
  return SIGNS.map((s) => bySign.get(s.key)).filter((r): r is HoroscopeRow => Boolean(r));
}

async function saveEntries(forDate: string, entries: HoroscopeEntry[]): Promise<void> {
  const vals: unknown[] = [];
  const tuples = entries.map((e, i) => {
    const b = i * 6;
    vals.push(forDate, e.sign, e.forecast, e.shubhRang, e.shubhAnk, e.shubhSamay);
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
  });
  await pool.query(
    `INSERT INTO horoscopes (for_date, sign, forecast, shubh_rang, shubh_ank, shubh_samay)
     VALUES ${tuples.join(",")}
     ON CONFLICT (for_date, sign) DO UPDATE SET
       forecast = EXCLUDED.forecast, shubh_rang = EXCLUDED.shubh_rang,
       shubh_ank = EXCLUDED.shubh_ank, shubh_samay = EXCLUDED.shubh_samay,
       wp_status = 'pending', wp_post_id = NULL, wp_error = NULL, updated_at = now()`,
    vals
  );
}

async function markPush(forDate: string, status: string, postId: string | null, error: string | null): Promise<void> {
  await pool.query(
    `UPDATE horoscopes SET wp_status = $2, wp_post_id = $3, wp_error = $4, updated_at = now() WHERE for_date = $1`,
    [forDate, status, postId, error]
  );
}

const rowToEntry = (r: HoroscopeRow): HoroscopeEntry => ({
  sign: r.sign, forecast: r.forecast, shubhRang: r.shubh_rang, shubhAnk: r.shubh_ank, shubhSamay: r.shubh_samay,
});

export type RunSummary = {
  forDate: string;
  generated: boolean;
  pushed: boolean;
  wpStatus: string; // pushed | failed | skipped | missing
  count: number;
  error?: string;
};

/**
 * Ensure the day's horoscope exists and is pushed to WordPress.
 *  • default (cron): generate only if missing, then push only if not already
 *    pushed — so a retry pass re-pushes a failed/unconfigured day WITHOUT
 *    regenerating the content.
 *  • regenerate: always regenerate + re-push (admin "regenerate now").
 *  • repushOnly: never generate; just (re)push what's stored (admin "re-push").
 */
export async function runHoroscope(
  forDate: string,
  opts: { regenerate?: boolean; repushOnly?: boolean } = {}
): Promise<RunSummary> {
  const existing = await getEntriesForDate(forDate);
  let generated = false;
  let entries: HoroscopeEntry[];

  if (opts.repushOnly) {
    if (existing.length !== 12) {
      return { forDate, generated: false, pushed: false, wpStatus: "missing", count: existing.length, error: "No horoscope stored for this date to re-push." };
    }
    entries = existing.map(rowToEntry);
  } else if (opts.regenerate || existing.length !== 12) {
    entries = await generateHoroscopes(forDate);
    await saveEntries(forDate, entries);
    generated = true;
  } else {
    entries = existing.map(rowToEntry);
    if (existing.every((r) => r.wp_status === "pushed")) {
      return { forDate, generated: false, pushed: true, wpStatus: "pushed", count: 12 };
    }
  }

  // Auto-push the moment it's ready.
  const push = await pushHoroscopes(forDate, entries);
  if (push.ok) {
    await markPush(forDate, "pushed", push.postId ?? null, null);
    return { forDate, generated, pushed: true, wpStatus: "pushed", count: entries.length };
  }
  // WordPress not configured yet (token not entered) — mark 'skipped' (awaiting
  // config) rather than 'failed', so a catch-up pass pushes it once the token is
  // set. A real HTTP error (incl. a genuine WP 503) is a 'failed'. Content is
  // still saved + visible either way.
  const status = push.notConfigured ? "skipped" : "failed";
  await markPush(forDate, status, null, push.error ?? "push failed");
  return { forDate, generated, pushed: false, wpStatus: status, count: entries.length, error: push.error };
}

/**
 * Re-push recent days that generated but never reached WordPress (failed or
 * skipped-because-unconfigured). Lets the whole backlog auto-publish the first
 * night AFTER the WordPress token is finally entered, instead of only new days.
 * Content is never regenerated — this only re-pushes what's already stored.
 */
export async function catchUpPushes(withinDays = 7, limit = 10): Promise<RunSummary[]> {
  const { rows } = await pool.query<{ for_date: string }>(
    `SELECT for_date::text AS for_date
       FROM horoscopes
      WHERE for_date >= (current_date - $1::int)
      GROUP BY for_date
     HAVING bool_or(wp_status <> 'pushed')
      ORDER BY for_date DESC
      LIMIT $2`,
    [withinDays, limit]
  );
  const out: RunSummary[] = [];
  for (const r of rows) out.push(await runHoroscope(r.for_date, { repushOnly: true }));
  return out;
}
