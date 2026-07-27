import { getSession } from "@/lib/auth/session";
import { runTrendsCrawl } from "@/lib/social/trends-crawl";

export const maxDuration = 200;
export const dynamic = "force-dynamic";

/** POST /api/social/trends/crawl — "Refresh trends" now. Editors + admins. */
export async function POST() {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await runTrendsCrawl("manual");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
