import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/server";
import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/drafts/save — persist a draft to the `drafts` table.
 *   status "in_progress"   = Save as draft
 *   status "awaiting_review" = Submit for review
 * Insert when no draftId, update otherwise. Returns the row id so the editor
 * can keep saving into the same draft.
 */
const Body = z.object({
  draftId: z.string().uuid().nullish(),
  trendId: z.string().uuid().nullish(),
  title: z.string().min(1).max(500),
  body: z.string().max(200_000).default(""),
  status: z.enum(["in_progress", "awaiting_review"]).default("in_progress"),
  desk: z.string().nullish(),
  meta: z.any().optional(),
  // Which surface the draft belongs to (print drafts never go to WordPress) and
  // the print city / edition it is filed under. Omitted → the user's edition.
  surface: z.enum(["digital", "print"]).nullish(),
  city: z.string().max(80).nullish(),
});

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { draftId, trendId, title, body, status, desk, meta, city } = parsed.data;
  const surface = parsed.data.surface ?? (session.edition === "print" ? "print" : "digital");

  // Updating: it must be the caller's own draft, and an approved/published
  // print story is frozen (the desk signed it off) — enforced here, not just in
  // the UI, so a stale tab can't overwrite or un-approve it.
  if (draftId) {
    const { rows } = await pool.query<{ author_id: string; status: string; surface: string }>(
      `SELECT author_id, status, surface FROM drafts WHERE id = $1`,
      [draftId]
    );
    const existing = rows[0];
    if (!existing || existing.author_id !== session.userId) {
      return Response.json({ error: "Draft not found — you can only edit your own drafts." }, { status: 404 });
    }
    if (existing.surface === "print" && (existing.status === "approved" || existing.status === "published")) {
      return Response.json({ error: "This story is approved by the desk and can no longer be edited." }, { status: 409 });
    }
  }

  const supabase = createAdminClient();
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  // Pull the (large) image data-URL into its own column so the list query can
  // cheaply flag "has image" without reading it; keep settings + widget in meta.
  const metaObj: Record<string, unknown> = { ...(meta ?? {}) };
  const image = typeof metaObj.image === "string" ? (metaObj.image as string) : null;
  delete metaObj.image;
  const row = {
    trend_id: trendId ?? null,
    author_id: session.userId,
    title,
    body,
    status,
    desk: desk ?? null,
    surface,
    city: city ?? null,
    word_count: wordCount,
    image_url: image,
    generation_metadata: metaObj,
    updated_at: new Date().toISOString(),
  };

  if (draftId) {
    const { data, error } = await supabase
      .from("drafts")
      .update(row)
      .eq("id", draftId)
      .eq("author_id", session.userId)
      .select("id")
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ id: (data as { id: string } | null)?.id ?? draftId, status });
  }

  const { data, error } = await supabase
    .from("drafts")
    .insert(row)
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id: (data as { id: string }).id, status });
}
