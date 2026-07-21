import { runTwitterDrafting } from "@/lib/twitter/draft";

// Each article does live web research; a batch needs real headroom.
export const maxDuration = 280;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/twitter-draft — write articles for newly captured tweets.
 *
 * Separate from BOTH the news ingest tick and the Twitter crawl tick:
 *  - never near the news pipeline (isolation),
 *  - and separate from the crawl so one slow generation can't stall crawling.
 *
 * Under /api/cron/* for the middleware auth bypass, then authenticates with
 * CRON_SECRET. Scheduled by deploy/cron-twitter-draft.sh.
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
    const result = await runTwitterDrafting();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
