import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

async function requireEditor() {
  const session = await getSession();
  return session?.role === "admin" || session?.role === "editor" ? session : null;
}

/**
 * GET /api/social/posts?days=7&platform=&sort=viral — the dashboard feed:
 * top posts across tracked accounts, plus per-platform totals.
 */
export async function GET(req: Request) {
  if (!(await requireEditor())) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(Number(url.searchParams.get("days")) || 7, 90));
  const platform = url.searchParams.get("platform");
  const sort = url.searchParams.get("sort") === "recent" ? "posted_at DESC" : "virality_score DESC, engagement DESC";
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const where: string[] = ["sp.posted_at >= $1"];
  const params: unknown[] = [cutoff];
  if (platform) { params.push(platform); where.push(`sp.platform = $${params.length}`); }

  try {
    const { rows: posts } = await pool.query(
      `SELECT sp.id, sp.platform, sp.post_id, sp.url, sp.content, sp.media_url,
              sp.posted_at, sp.likes, sp.comments, sp.shares, sp.views,
              sp.engagement, sp.engagement_rate, sp.virality_score,
              sa.handle, sa.display_name, sa.kind
         FROM social_posts sp
         JOIN social_accounts sa ON sa.id = sp.account_id
        WHERE ${where.join(" AND ")}
        ORDER BY ${sort}
        LIMIT 60`,
      params
    );

    const { rows: byPlatform } = await pool.query(
      `SELECT sp.platform,
              count(*)::int AS posts,
              round(avg(sp.virality_score))::int AS avg_virality,
              sum(sp.engagement)::bigint AS engagement
         FROM social_posts sp
        WHERE sp.posted_at >= $1
        GROUP BY sp.platform`,
      [cutoff]
    );

    return Response.json({ posts, byPlatform });
  } catch (err) {
    return Response.json(
      { posts: [], byPlatform: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}
