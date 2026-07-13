import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/drafts — the signed-in user's own saved articles (lightweight list;
 * no body/settings/image so it stays fast). Full detail is /api/drafts/[id].
 */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await pool.query(
      `SELECT id, title, status, word_count, desk, created_at, updated_at,
              (image_url IS NOT NULL) AS has_image
         FROM drafts
        WHERE author_id = $1
        ORDER BY updated_at DESC
        LIMIT 300`,
      [session.userId]
    );
    return Response.json({ drafts: res.rows });
  } catch (err) {
    return Response.json(
      { drafts: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}
