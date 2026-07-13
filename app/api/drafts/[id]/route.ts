import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/drafts/[id] — full detail of one of the user's own articles
 * (body, settings, image, widget). Returns 404 if it isn't theirs. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const res = await pool.query(
    `SELECT id, title, body, status, word_count, desk, image_url, generation_metadata,
            created_at, updated_at
       FROM drafts
      WHERE id = $1 AND author_id = $2
      LIMIT 1`,
    [id, session.userId]
  );
  const draft = res.rows[0];
  if (!draft) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ draft });
}

/** DELETE /api/drafts/[id] — remove one of the user's own articles. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  await pool.query("DELETE FROM drafts WHERE id = $1 AND author_id = $2", [id, session.userId]);
  return Response.json({ ok: true });
}
