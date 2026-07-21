import { runTwitterCrawl } from "@/lib/twitter/crawl";

// Crawling N accounts through the Python shim is network-bound; give it room
// without approaching the news ingest's 300s so the two can never overlap badly.
export const maxDuration = 240;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/twitter — the Twitter crawl tick.
 *
 * Deliberately a SEPARATE endpoint and cron schedule from /api/cron/ingest:
 * the Twitter feature must never be able to slow down, block or fail the news
 * pipeline. Nothing in this path touches signals/sources/trends/drafts.
 *
 * Lives under /api/cron/* so it inherits the middleware's auth bypass, then
 * authenticates itself with CRON_SECRET exactly like the ingest tick.
 * Scheduled by deploy/cron-twitter.sh.
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
    const result = await runTwitterCrawl("cron");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    // Swallow into a 500 rather than throwing — a Twitter failure is contained
    // here and must never surface anywhere near the news flow.
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
