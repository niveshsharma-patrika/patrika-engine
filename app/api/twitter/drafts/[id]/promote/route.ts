import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/twitter/drafts/[id]/promote — "Send to My Articles".
 *
 * THE ONLY PLACE the Twitter feature writes into a newsroom table, and it runs
 * exclusively on an explicit human click. Nothing automated ever creates a
 * `drafts` row.
 *
 * The new draft is owned by the clicking user (author_id), which is what makes
 * it appear in their My Articles list — /api/drafts filters on author_id, so
 * an unowned row would be invisible to everyone.
 *
 * Provenance (tweet id, handle, source URL) is recorded in generation_metadata
 * so the desk can always trace an article back to the post that prompted it.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the row so a double-click can't create two newsroom drafts.
    const { rows } = await client.query(
      `SELECT d.id, d.title, d.body, d.word_count, d.promoted_at,
              t.tweet_id, t.author_handle, t.url AS tweet_url, t.posted_at,
              a.desk
         FROM twitter_drafts d
         JOIN tweets t ON t.id = d.tweet_id
         JOIN twitter_accounts a ON a.id = t.account_id
        WHERE d.id = $1
          FOR UPDATE OF d`,
      [id]
    );

    const draft = rows[0];
    if (!draft) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Draft not found" }, { status: 404 });
    }
    if (draft.promoted_at) {
      await client.query("ROLLBACK");
      return Response.json(
        { error: "Already sent to My Articles." },
        { status: 409 }
      );
    }

    const { rows: created } = await client.query(
      `INSERT INTO drafts (title, body, status, author_id, word_count, desk,
                           generation_metadata)
            VALUES ($1, $2, 'in_progress', $3, $4, $5, $6::jsonb)
         RETURNING id`,
      [
        draft.title,
        draft.body,
        session.userId,
        draft.word_count ?? 0,
        draft.desk ?? null,
        JSON.stringify({
          source: "twitter",
          tweet_id: draft.tweet_id,
          handle: draft.author_handle,
          tweet_url: draft.tweet_url,
          posted_at: draft.posted_at,
          promoted_by: session.userId,
        }),
      ]
    );

    const newDraftId = created[0].id as string;

    await client.query(
      `UPDATE twitter_drafts
          SET promoted_draft_id = $2, promoted_at = now(), promoted_by = $3
        WHERE id = $1`,
      [id, newDraftId, session.userId]
    );

    await client.query("COMMIT");
    return Response.json({ ok: true, draftId: newDraftId });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return Response.json(
      { error: err instanceof Error ? err.message : "promote failed" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
