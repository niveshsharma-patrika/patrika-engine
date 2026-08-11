import { getSession } from "@/lib/auth/session";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/social/saved/[id] — the saved post's image data URL (fetched lazily
 * so the list endpoint doesn't ship multi-MB blobs). Editor+admin. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const { rows } = await pool.query<{ image: string | null }>(
      `SELECT image FROM social_saved_posts WHERE id = $1`,
      [id]
    );
    return Response.json({ image: rows[0]?.image ?? null });
  } catch (err) {
    return Response.json(
      { image: null, error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}

/** DELETE /api/social/saved/[id] — remove a saved creative pack. Editor+admin. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    await pool.query(`DELETE FROM social_saved_posts WHERE id = $1`, [id]);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "delete failed" },
      { status: 500 }
    );
  }
}
