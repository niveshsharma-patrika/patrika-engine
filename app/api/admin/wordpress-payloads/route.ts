import { getSession } from "@/lib/auth/session";
import { listWordPressPayloads } from "@/lib/wordpress-log";

export const dynamic = "force-dynamic";

/** GET /api/admin/wordpress-payloads?limit=50&before=<id> — newest-first page of
 *  the Patrika+ → WordPress payload audit log. Admin only. */
export async function GET(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const limit = Math.max(1, Math.min(Number(sp.get("limit")) || 50, 200));
  const before = sp.get("before") ?? undefined;

  const rows = await listWordPressPayloads(limit, before);
  return Response.json({ rows, hasMore: rows.length === limit });
}
