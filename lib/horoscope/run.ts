import { pool } from "@/lib/db";

import { generateHoroscopes, type HoroscopeEntry } from "./generate";
import { getHoroscopeWpConfig, pushSign } from "./wordpress";
import { SIGNS } from "./signs";

export type HoroscopeRow = {
  sign: string;
  forecast: string;
  shubh_rang: string;
  shubh_ank: string;
  shubh_samay: string;
  zodiac_content: string;
  lucky_color_code: string;
  mood: string;
  solution: string;
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

const SELECT_COLS =
  "sign, forecast, shubh_rang, shubh_ank, shubh_samay, zodiac_content, lucky_color_code, mood, solution, wp_status, wp_post_id, wp_error, updated_at";

/** The 12 rows for a date, in canonical sign order (or fewer if not generated). */
export async function getEntriesForDate(forDate: string): Promise<HoroscopeRow[]> {
  const { rows } = await pool.query<HoroscopeRow>(
    `SELECT ${SELECT_COLS} FROM horoscopes WHERE for_date = $1`,
    [forDate]
  );
  const bySign = new Map(rows.map((r) => [r.sign, r]));
  return SIGNS.map((s) => bySign.get(s.key)).filter((r): r is HoroscopeRow => Boolean(r));
}

async function saveEntries(forDate: string, entries: HoroscopeEntry[]): Promise<void> {
  const vals: unknown[] = [];
  const tuples = entries.map((e, i) => {
    const b = i * 10;
    vals.push(forDate, e.sign, e.forecast, e.luckyColor, e.luckyNumber, e.luckyTime, e.zodiacContent, e.luckyColorCode, e.mood, e.solution);
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`;
  });
  await pool.query(
    `INSERT INTO horoscopes
       (for_date, sign, forecast, shubh_rang, shubh_ank, shubh_samay, zodiac_content, lucky_color_code, mood, solution)
     VALUES ${tuples.join(",")}
     ON CONFLICT (for_date, sign) DO UPDATE SET
       forecast = EXCLUDED.forecast, shubh_rang = EXCLUDED.shubh_rang,
       shubh_ank = EXCLUDED.shubh_ank, shubh_samay = EXCLUDED.shubh_samay,
       zodiac_content = EXCLUDED.zodiac_content, lucky_color_code = EXCLUDED.lucky_color_code,
       mood = EXCLUDED.mood, solution = EXCLUDED.solution,
       wp_status = 'pending', wp_post_id = NULL, wp_error = NULL, updated_at = now()`,
    vals
  );
}

async function markSign(forDate: string, sign: string, status: string, postId: string | null, error: string | null): Promise<void> {
  await pool.query(
    `UPDATE horoscopes SET wp_status = $3, wp_post_id = $4, wp_error = $5, updated_at = now() WHERE for_date = $1 AND sign = $2`,
    [forDate, sign, status, postId, error]
  );
}

const rowToEntry = (r: HoroscopeRow): HoroscopeEntry => ({
  sign: r.sign, forecast: r.forecast, zodiacContent: r.zodiac_content,
  luckyColor: r.shubh_rang, luckyColorCode: r.lucky_color_code,
  luckyNumber: r.shubh_ank, luckyTime: r.shubh_samay, mood: r.mood, solution: r.solution,
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
 * Ensure the day's horoscope exists and every sign is pushed to WordPress.
 *  • default (cron): generate only if missing, then push only the signs not yet
 *    pushed — so a retry/catch-up re-pushes failed/unconfigured signs WITHOUT
 *    regenerating content.
 *  • regenerate: always regenerate + push all 12 (admin "regenerate now").
 *  • repushOnly: never generate; (re)push the signs that aren't pushed yet.
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
  }

  // Auto-push, one post per sign. If WordPress isn't configured, mark the not-yet
  // -pushed signs 'skipped' (awaiting config) so the catch-up pass sends them
  // once the token is set. Content is saved + visible regardless.
  const cfg = await getHoroscopeWpConfig();
  if (!cfg) {
    await pool.query(
      `UPDATE horoscopes SET wp_status = 'skipped', wp_error = 'WordPress not configured', updated_at = now()
        WHERE for_date = $1 AND wp_status <> 'pushed'`,
      [forDate]
    );
    return { forDate, generated, pushed: false, wpStatus: "skipped", count: entries.length, error: "WordPress not configured" };
  }

  const pushedSigns = new Set(generated ? [] : existing.filter((r) => r.wp_status === "pushed").map((r) => r.sign));
  const toPush = entries.filter((e) => !pushedSigns.has(e.sign));
  await Promise.all(
    toPush.map(async (e) => {
      const res = await pushSign(cfg, forDate, e);
      await markSign(forDate, e.sign, res.ok ? "pushed" : "failed", res.ok ? (res.postId ?? null) : null, res.ok ? null : (res.error ?? "push failed"));
    })
  );

  const after = await getEntriesForDate(forDate);
  const wpStatus =
    after.length === 0 ? "missing"
    : after.every((r) => r.wp_status === "pushed") ? "pushed"
    : after.some((r) => r.wp_status === "failed") ? "failed"
    : after.some((r) => r.wp_status === "skipped") ? "skipped"
    : "pending";
  return { forDate, generated, pushed: wpStatus === "pushed", wpStatus, count: after.length };
}

/**
 * Re-push recent days that generated but never fully reached WordPress (failed
 * or skipped-because-unconfigured). Lets the whole backlog auto-publish the
 * first night AFTER the WordPress token is entered. Never regenerates content.
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
