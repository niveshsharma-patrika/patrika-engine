import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/twitter/tweets — captured tweets, newest first.
 *
 * Every crawled tweet is listed, including the ones the classifier set aside
 * (`skipped_retweet`, `nothing_to_write`) with the reason attached — the desk
 * should always be able to see WHY something didn't become a story. Nothing is
 * ever silently dropped.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const accountId = url.searchParams.get("account");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 300);

  const where: string[] = [];
  const params: unknown[] = [];
  if (status) {
    params.push(status);
    where.push(`t.status = $${params.length}`);
  }
  if (accountId) {
    params.push(accountId);
    where.push(`t.account_id = $${params.length}`);
  }
  params.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.tweet_id, t.author_handle, t.content, t.url, t.posted_at,
              t.is_retweet, t.is_reply, t.metrics, t.media, t.status,
              t.status_reason, t.crawled_at, t.draft_error,
              a.display_name, a.category, a.tier,
              d.id AS draft_id, d.title AS draft_title, d.promoted_at
         FROM tweets t
         JOIN twitter_accounts a ON a.id = t.account_id
         LEFT JOIN twitter_drafts d ON d.tweet_id = t.id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY t.posted_at DESC
        LIMIT $${params.length}`,
      params
    );

    const { rows: counts } = await pool.query<{ status: string; n: string }>(
      `SELECT status, count(*)::text AS n FROM tweets GROUP BY status`
    );

    return Response.json({
      tweets: rows,
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
    });
  } catch (err) {
    return Response.json(
      { tweets: [], counts: {}, error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}
