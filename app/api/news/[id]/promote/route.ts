import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/news/[id]/promote — turn a news tip into a newsroom draft.
 *
 * Admin only. Creates a `drafts` row (owned by the promoting admin, who can
 * reassign it in the editor) seeded with the tip's headline + details, the
 * first photo as the draft image, and provenance in generation_metadata.
 *
 * Transactional with FOR UPDATE so a double-click can't create two drafts.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, headline, details, location, category, attachments,
              status, submitter_id
         FROM news_submissions
        WHERE id = $1
          FOR UPDATE`,
      [id]
    );
    const tip = rows[0];
    if (!tip) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Submission not found" }, { status: 404 });
    }
    if (tip.status === "promoted") {
      await client.query("ROLLBACK");
      return Response.json({ error: "Already promoted to a draft." }, { status: 409 });
    }

    const attachments = Array.isArray(tip.attachments) ? tip.attachments : [];
    const firstImage =
      attachments[0] && typeof attachments[0].data === "string" ? attachments[0].data : null;

    const body = tip.location
      ? `${tip.details}\n\n(${tip.location})`.trim()
      : tip.details;
    const words = String(body).trim().split(/\s+/).filter(Boolean).length;

    const { rows: created } = await client.query(
      `INSERT INTO drafts (title, body, status, author_id, word_count, desk, image_url,
                           generation_metadata)
            VALUES ($1, $2, 'in_progress', $3, $4, $5, $6, $7::jsonb)
         RETURNING id`,
      [
        tip.headline,
        body,
        session.userId,
        words,
        tip.category,
        firstImage,
        JSON.stringify({
          source: "news_inbox",
          submission_id: tip.id,
          submitter_id: tip.submitter_id,
          category: tip.category,
          location: tip.location,
          extra_images: attachments.length > 1 ? attachments.length - 1 : 0,
          promoted_by: session.userId,
        }),
      ]
    );

    const newDraftId = created[0].id as string;

    await client.query(
      `UPDATE news_submissions
          SET status = 'promoted', promoted_draft_id = $2, promoted_at = now(), promoted_by = $3
        WHERE id = $1`,
      [id, newDraftId, session.userId]
    );

    await client.query("COMMIT");
    return Response.json({ ok: true, draftId: newDraftId });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("news promote failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "promote failed" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
