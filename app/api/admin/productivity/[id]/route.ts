import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/productivity/[id]?days=30 — one author's stories.
 * Admin-only drill-down for the productivity report.
 */
async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam === "all" ? 0 : Math.max(0, Math.min(Number(daysParam) || 30, 3650));
  const cutoff = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  try {
    const params: unknown[] = [id];
    if (cutoff) params.push(cutoff);
    const { rows } = await pool.query(
      `SELECT id, title, status, word_count, desk, created_at, updated_at, published_at
         FROM drafts
        WHERE author_id = $1
          ${cutoff ? "AND created_at >= $2" : ""}
        ORDER BY updated_at DESC
        LIMIT 200`,
      params
    );
    return Response.json({ stories: rows });
  } catch (err) {
    return Response.json(
      { stories: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}
