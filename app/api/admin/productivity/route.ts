import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/productivity?days=30 — per-author story productivity.
 *
 * Admin-only. Aggregates the `drafts` table by author so admins can see who
 * created what, broken down by review stage. A LEFT JOIN keeps users with zero
 * stories in range visible (a productivity report should show the quiet ones
 * too, not just the active ones).
 *
 * `days` = 0 (or "all") removes the time filter.
 */
async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam === "all" ? 0 : Math.max(0, Math.min(Number(daysParam) || 30, 3650));
  const cutoff = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  try {
    // Date filter lives in the JOIN condition so zero-story users still appear.
    const { rows } = await pool.query(
      `SELECT p.id, p.full_name, p.role, p.desk,
              count(d.id)::int AS total,
              count(*) FILTER (WHERE d.status = 'published')::int        AS published,
              count(*) FILTER (WHERE d.status = 'approved')::int         AS approved,
              count(*) FILTER (WHERE d.status IN ('awaiting_review','awaiting_approval'))::int AS in_review,
              count(*) FILTER (WHERE d.status = 'in_progress')::int      AS in_progress,
              count(*) FILTER (WHERE d.status = 'rejected')::int         AS rejected,
              COALESCE(sum(d.word_count), 0)::int AS words,
              -- Every generation this user ran, saved or not (subquery so the
              -- drafts LEFT JOIN doesn't multiply the event count).
              (SELECT count(*) FROM generation_events g
                WHERE g.user_id = p.id ${cutoff ? "AND g.created_at >= $1" : ""})::int AS generated,
              GREATEST(
                max(d.updated_at),
                (SELECT max(created_at) FROM generation_events g2 WHERE g2.user_id = p.id)
              ) AS last_activity
         FROM profiles p
         LEFT JOIN drafts d
           ON d.author_id = p.id
          ${cutoff ? "AND d.created_at >= $1" : ""}
        WHERE p.is_active = true
        GROUP BY p.id, p.full_name, p.role, p.desk
        ORDER BY generated DESC, total DESC, p.full_name ASC`,
      cutoff ? [cutoff] : []
    );

    // Team totals across the same window.
    const totals = rows.reduce(
      (a, r) => ({
        stories: a.stories + r.total,
        generated: a.generated + r.generated,
        published: a.published + r.published,
        in_review: a.in_review + r.in_review,
        words: a.words + r.words,
      }),
      { stories: 0, generated: 0, published: 0, in_review: 0, words: 0 }
    );

    return Response.json({ users: rows, totals, days });
  } catch (err) {
    return Response.json(
      { users: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}
