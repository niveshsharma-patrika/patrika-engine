import { getSession } from "@/lib/auth/session";
import { DATE_RE, getFeedList } from "@/lib/editorial-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/editorial-feed?date=YYYY-MM-DD — light list items + filter facets
 *  for the editorial-feed viewer. Signed-in users only. */
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return Response.json({ error: "Invalid date (YYYY-MM-DD)" }, { status: 400 });

  try {
    return Response.json(await getFeedList(date));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load the feed" },
      { status: 502 }
    );
  }
}
