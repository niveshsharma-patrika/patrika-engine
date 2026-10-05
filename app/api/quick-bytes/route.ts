import { getSession } from "@/lib/auth/session";
import { listRecent } from "@/lib/quick-bytes/store";

export const dynamic = "force-dynamic";

/** GET /api/quick-bytes — recent saved Quick Bytes, for the Saved list. */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await listRecent();
  return Response.json({
    bytes: rows.map((r) => ({
      id: r.id,
      magazine: r.magazine,
      headline: r.headline,
      status: r.status,
      wpUrl: r.wp_url,
      cardCount: Array.isArray(r.cards) ? r.cards.length : 0,
      updatedAt: r.updated_at,
    })),
  });
}
