import { getSession } from "@/lib/auth/session";
import { DATE_RE, getFeedItem } from "@/lib/editorial-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/editorial-feed/item?date=YYYY-MM-DD&id=... — one full article
 *  (with body) for the detail page. Signed-in users only. */
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const date = sp.get("date") ?? "";
  const id = sp.get("id") ?? "";
  if (!DATE_RE.test(date)) return Response.json({ error: "Invalid date (YYYY-MM-DD)" }, { status: 400 });
  if (!id.trim()) return Response.json({ error: "Missing id" }, { status: 400 });

  try {
    const item = await getFeedItem(date, id);
    if (!item) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ item });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load the article" },
      { status: 502 }
    );
  }
}
