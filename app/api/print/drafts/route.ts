import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/print/drafts?view=mine|desk
 *  - mine: the signed-in writer's print drafts.
 *  - desk (editor/admin): the desk queue — submitted / approved / sent-back
 *    print stories across all writers, submitted first.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const view = new URL(req.url).searchParams.get("view") === "desk" ? "desk" : "mine";
  const isEditor = session.role === "admin" || session.role === "editor";
  if (view === "desk" && !isEditor) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { rows } = view === "mine"
      ? await pool.query(
          `SELECT id, title, status, word_count, city, desk, assigned_to, created_at, updated_at, NULL::text AS author_name
             FROM drafts WHERE surface = 'print' AND author_id = $1
            ORDER BY updated_at DESC LIMIT 200`,
          [session.userId]
        )
      : await pool.query(
          `SELECT d.id, d.title, d.status, d.word_count, d.city, d.desk, d.assigned_to, d.created_at, d.updated_at,
                  p.full_name AS author_name
             FROM drafts d LEFT JOIN profiles p ON p.id = d.author_id
            WHERE d.surface = 'print' AND d.status IN ('awaiting_review', 'approved', 'rejected')
            ORDER BY (d.status = 'awaiting_review') DESC, d.updated_at DESC LIMIT 300`
        );
    return Response.json({ drafts: rows });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load" }, { status: 500 });
  }
}
