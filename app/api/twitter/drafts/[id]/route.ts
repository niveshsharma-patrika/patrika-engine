import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

async function requireEditor() {
  const session = await getSession();
  return session?.role === "admin" || session?.role === "editor" ? session : null;
}

const PatchBody = z.object({
  title: z.string().min(1).max(280).optional(),
  body: z.string().max(60_000).optional(),
});

/** PATCH /api/twitter/drafts/[id] — save desk edits before promotion. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireEditor())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { title, body } = parsed.data;
  if (title === undefined && body === undefined) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const words = body ? body.trim().split(/\s+/).filter(Boolean).length : null;

  try {
    const { rows } = await pool.query(
      `UPDATE twitter_drafts
          SET title = COALESCE($2, title),
              body = COALESCE($3, body),
              word_count = COALESCE($4, word_count),
              updated_at = now()
        WHERE id = $1 AND promoted_at IS NULL
    RETURNING id, title, body, word_count, updated_at`,
      [id, title ?? null, body ?? null, words]
    );
    if (rows.length === 0) {
      return Response.json(
        { error: "Draft not found, or already sent to My Articles." },
        { status: 404 }
      );
    }
    return Response.json({ draft: rows[0] });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "update failed" },
      { status: 500 }
    );
  }
}

/** DELETE /api/twitter/drafts/[id] — discard a generated article. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireEditor())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM twitter_drafts WHERE id = $1 AND promoted_at IS NULL`,
      [id]
    );
    if (!rowCount) {
      return Response.json({ error: "Not found or already promoted" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "delete failed" },
      { status: 500 }
    );
  }
}
