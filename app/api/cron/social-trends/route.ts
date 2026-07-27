import { runTrendsCrawl } from "@/lib/social/trends-crawl";

export const maxDuration = 200;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/social-trends — crawl social feeds for trending items.
 * Own cron, separate from news + Twitter + social-sync. CRON_SECRET auth.
 * Scheduled by deploy/cron-social-trends.sh.
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
  try {
    const result = await runTrendsCrawl("cron");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
