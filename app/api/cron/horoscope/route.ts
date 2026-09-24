import { runHoroscope, catchUpPushes, istDate } from "@/lib/horoscope/run";

export const dynamic = "force-dynamic";
export const maxDuration = 200;

/**
 * GET /api/cron/horoscope — generate the day's rashifal (all 12 signs) and
 * auto-push it to WordPress. CRON_SECRET auth. Scheduled by
 * deploy/cron-horoscope.sh (midnight IST + a retry pass).
 *
 * Idempotent: if today's set already exists and is pushed, it no-ops; if it
 * exists but the push failed/was skipped, it only re-pushes. `?force=1`
 * regenerates; `?date=YYYY-MM-DD` overrides the target day (default: today IST).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || auth !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const dateParam = url.searchParams.get("date");
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return Response.json({ error: "Bad date" }, { status: 400 });
  }
  const forDate = dateParam || istDate();

  try {
    const summary = await runHoroscope(forDate, { regenerate: force });
    // Also re-push any recent days that generated but never reached WordPress
    // (e.g. days produced before the WP token was configured).
    const caughtUp = await catchUpPushes();
    return Response.json({ ok: true, ...summary, caughtUp: caughtUp.filter((c) => c.forDate !== forDate).map((c) => ({ date: c.forDate, wpStatus: c.wpStatus })) });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
