import { getSession } from "@/lib/auth/session";
import { runTwitterCrawl } from "@/lib/twitter/crawl";

export const maxDuration = 240;
export const dynamic = "force-dynamic";

/**
 * POST /api/twitter/crawl — "Crawl now" button, for testing without waiting
 * for the cron tick. Same isolated code path as the cron; touches nothing in
 * the news pipeline.
 */
export async function POST() {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await runTwitterCrawl("manual");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
