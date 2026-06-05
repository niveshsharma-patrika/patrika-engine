import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/style/samples/:id  → delete one sample by id
 * PUT    /api/style/samples/:id  → update one sample by id
 */

const VALID_STORY_TYPES = new Set([
  "Breaking news",
  "Analysis",
  "Explainer",
  "Profile",
  "Service piece",
  "Investigation",
  "Op-ed",
  "Sidebar",
  "Feature",
]);

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("style_samples").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const { id } = await params;
  let body: {
    title?: string;
    body?: string;
    story_type?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) update.title = body.title.toString().trim();
  if (body.body !== undefined) update.body = body.body.toString().trim();
  if (body.notes !== undefined) update.notes = body.notes.toString() || null;
  if (body.story_type !== undefined) {
    update.story_type =
      body.story_type && VALID_STORY_TYPES.has(body.story_type.trim())
        ? body.story_type.trim()
        : null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("style_samples")
    .update(update)
    .eq("id", id)
    .select("id, title, body, story_type, source_url, notes, created_at, updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sample: data });
}
