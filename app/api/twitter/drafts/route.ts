import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { runTwitterDrafting } from "@/lib/twitter/draft";

export const maxDuration = 280;
export const dynamic = "force-dynamic";

async function requireEditor() {
  const session = await getSession();
  return session?.role === "admin" || session?.role === "editor" ? session : null;
}

/** GET /api/twitter/drafts — generated articles awaiting review. */
export async function GET(req: Request) {
  if (!(await requireEditor())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const includePromoted = url.searchParams.get("promoted") === "1";

  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.body, d.language, d.word_count, d.sources_used,
              d.created_at, d.promoted_at, d.promoted_draft_id,
              t.tweet_id, t.author_handle, t.content AS tweet_text,
              t.url AS tweet_url, t.posted_at,
              a.display_name, a.category, a.desk
         FROM twitter_drafts d
         JOIN tweets t ON t.id = d.tweet_id
         JOIN twitter_accounts a ON a.id = t.account_id
        ${includePromoted ? "" : "WHERE d.promoted_at IS NULL"}
        ORDER BY d.created_at DESC
        LIMIT 100`
    );

    const { rows: caps } = await pool.query<{ used: string; daily_cap: number }>(
      `SELECT (SELECT count(*) FROM twitter_drafts
                WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
                                    AT TIME ZONE 'Asia/Kolkata')::text AS used,
              (SELECT daily_cap FROM twitter_settings WHERE id = true) AS daily_cap`
    );

    return Response.json({
      drafts: rows,
      today: { used: Number(caps[0]?.used ?? 0), cap: caps[0]?.daily_cap ?? 0 },
    });
  } catch (err) {
    return Response.json(
      { drafts: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/twitter/drafts — "Write articles now", for testing without waiting
 * for the cron. Passing a limit also bypasses the auto_draft switch, so the
 * desk can generate on demand while auto-drafting is off.
 */
export async function POST(req: Request) {
  if (!(await requireEditor())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit) || 3, 1), 10);

  try {
    const result = await runTwitterDrafting(limit);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
