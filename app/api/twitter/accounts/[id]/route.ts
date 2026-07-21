import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

async function requireEditor() {
  const session = await getSession();
  return session?.role === "admin" || session?.role === "editor" ? session : null;
}

const PatchBody = z.object({
  display_name: z.string().max(120).nullable().optional(),
  category: z.enum(["figure", "company", "organisation", "government", "media"]).optional(),
  tier: z.number().int().min(1).max(3).optional(),
  desk: z.string().max(60).nullable().optional(),
  language: z.enum(["en", "hi"]).optional(),
  is_active: z.boolean().optional(),
});

/** PATCH /api/twitter/accounts/[id] — edit or pause a watched account. */
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

  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Whitelisted column names only — the keys come from the zod schema above,
  // never straight from the request body.
  const setSql = fields.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  const values = fields.map(([, v]) => v);

  try {
    const { rows } = await pool.query(
      `UPDATE twitter_accounts
          SET ${setSql}
        WHERE id = $1
      RETURNING id, handle, display_name, category, tier, desk, language,
                is_active, last_crawled_at, consecutive_errors, last_error,
                tweets_total`,
      [id, ...values]
    );
    if (rows.length === 0) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }
    return Response.json({ account: rows[0] });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "update failed" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/twitter/accounts/[id] — stop watching an account.
 * Cascades to its tweets (see deploy/twitter.sql). Touches nothing outside the
 * Twitter tables.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireEditor())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  try {
    const { rowCount } = await pool.query(`DELETE FROM twitter_accounts WHERE id = $1`, [id]);
    if (!rowCount) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "delete failed" },
      { status: 500 }
    );
  }
}
