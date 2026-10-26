import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/print/drafts/[id] — one print draft (author, or editor/admin). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const isEditor = session.role === "admin" || session.role === "editor";
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.body, d.status, d.city, d.desk, d.word_count, d.assigned_to, d.author_id,
              d.generation_metadata, d.created_at, d.updated_at, p.full_name AS author_name
         FROM drafts d LEFT JOIN profiles p ON p.id = d.author_id
        WHERE d.id = $1 AND d.surface = 'print' ${isEditor ? "" : "AND d.author_id = $2"}
        LIMIT 1`,
      isEditor ? [id] : [id, session.userId]
    );
    if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ draft: { ...rows[0], mine: rows[0].author_id === session.userId } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/** PATCH /api/print/drafts/[id] — desk actions (editor/admin): approve, send
 *  back, re-queue, or assign. Body: { status?: approved|rejected|awaiting_review, assigned_to?: uuid|null } */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "editor") return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const status = typeof body?.status === "string" && ["approved", "rejected", "awaiting_review"].includes(body.status) ? body.status : null;
  if (body && "status" in body && !status) return Response.json({ error: "Bad status" }, { status: 400 });
  const hasAssign = Boolean(body) && "assigned_to" in body;
  if (hasAssign && body.assigned_to !== null && !(typeof body.assigned_to === "string" && UUID.test(body.assigned_to))) {
    return Response.json({ error: "Bad assignee" }, { status: 400 });
  }
  const assignedTo: string | null = hasAssign ? body.assigned_to : null;
  if (!status && !hasAssign) return Response.json({ error: "Nothing to update" }, { status: 400 });

  const sets: string[] = ["reviewer_id = $2", "updated_at = now()"];
  const params: unknown[] = [id, session.userId];
  if (status) { params.push(status); sets.push(`status = $${params.length}`); }
  if (hasAssign) { params.push(assignedTo); sets.push(`assigned_to = $${params.length}`); }

  try {
    const { rowCount } = await pool.query(`UPDATE drafts SET ${sets.join(", ")} WHERE id = $1 AND surface = 'print'`, params);
    if (!rowCount) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
