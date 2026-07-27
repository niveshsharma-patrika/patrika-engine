import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

async function requireEditor() {
  const session = await getSession();
  return session?.role === "admin" || session?.role === "editor" ? session : null;
}

/**
 * GET /api/social/trends?platform=&days=2 — trending items ranked by "heat":
 * engagement (score + 2×comments) decayed by age, so fresh + hot floats up.
 */
export async function GET(req: Request) {
  if (!(await requireEditor())) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform");
  const days = Math.max(1, Math.min(Number(url.searchParams.get("days")) || 2, 14));
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const where: string[] = ["fetched_at >= $1"];
  const params: unknown[] = [cutoff];
  if (platform) { params.push(platform); where.push(`platform = $${params.length}`); }

  try {
    const { rows } = await pool.query(
      `SELECT id, platform, external_id, title, body, url, permalink, thumbnail,
              author, origin, score, comments, posted_at, fetched_at,
              (generated IS NOT NULL) AS has_creative,
              -- heat: engagement decayed ~ by hours since fetch.
              round(
                (score + comments * 2)
                / power(GREATEST(extract(epoch from (now() - COALESCE(posted_at, fetched_at)))/3600, 1), 0.6)
              ) AS heat
         FROM social_trend_items
        WHERE ${where.join(" AND ")}
        ORDER BY heat DESC
        LIMIT 60`,
      params
    );

    const { rows: byPlatform } = await pool.query(
      `SELECT platform, count(*)::int AS items FROM social_trend_items
        WHERE fetched_at >= $1 GROUP BY platform`,
      [cutoff]
    );

    return Response.json({ trends: rows, byPlatform });
  } catch (err) {
    return Response.json(
      { trends: [], byPlatform: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}
