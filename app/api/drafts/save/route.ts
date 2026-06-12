import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/server";

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
  title: z.string().min(1),
  body: z.string().default(""),
  status: z.enum(["in_progress", "awaiting_review"]).default("in_progress"),
  desk: z.string().nullish(),
  meta: z.any().optional(),
});

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { draftId, trendId, title, body, status, desk, meta } = parsed.data;

  const supabase = createAdminClient();
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const row = {
    trend_id: trendId ?? null,
    title,
    body,
    status,
    desk: desk ?? null,
    word_count: wordCount,
    generation_metadata: meta ?? {},
    updated_at: new Date().toISOString(),
  };

  if (draftId) {
    const { data, error } = await supabase
      .from("drafts")
      .update(row)
      .eq("id", draftId)
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
