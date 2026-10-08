import { getSession } from "@/lib/auth/session";
import { DATE_RE, getFeedPage } from "@/lib/editorial-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/editorial-feed?date=YYYY-MM-DD&start=N — ONE page of light list
 *  items plus `nextStart` for the next page. The client walks the cursor and
 *  builds facets/filters across pages. Signed-in users only. */
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const date = sp.get("date") ?? "";
  if (!DATE_RE.test(date)) return Response.json({ error: "Invalid date (YYYY-MM-DD)" }, { status: 400 });
  const startRaw = Number(sp.get("start") ?? "0");
  const start = Number.isInteger(startRaw) && startRaw >= 0 ? startRaw : 0;

  try {
    return Response.json(await getFeedPage(date, start));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load the feed" },
      { status: 502 }
    );
  }
}
