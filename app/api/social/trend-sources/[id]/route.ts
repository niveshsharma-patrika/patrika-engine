import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

async function requireEditor() {
  const session = await getSession();
  return session?.role === "admin" || session?.role === "editor" ? session : null;
}

const Patch = z.object({ is_active: z.boolean().optional(), label: z.string().max(120).optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireEditor())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });
  const setSql = fields.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  try {
    const { rows } = await pool.query(
      `UPDATE social_trend_sources SET ${setSql} WHERE id = $1
        RETURNING id, platform, query, label, is_active, last_crawled_at, last_error`,
      [id, ...fields.map(([, v]) => v)]
    );
    if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ source: rows[0] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireEditor())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  try {
    const { rowCount } = await pool.query(`DELETE FROM social_trend_sources WHERE id = $1`, [id]);
    if (!rowCount) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "delete failed" }, { status: 500 });
  }
}
