import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET  /api/style/guidelines  → returns the single guidelines row (or null)
 * PUT  /api/style/guidelines  → upserts the guidelines content
 *
 * Singleton table: we always work with one row. The first PUT creates it,
 * subsequent PUTs update the existing row (by id, looked up via the GET).
 */

type GuidelinesRow = {
  id: string;
  content: string;
  notes: string | null;
  updated_at: string;
};

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ guidelines: null, reason: "supabase_not_configured" });
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("style_guidelines")
    .select("id, content, notes, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Response.json({ guidelines: (data as GuidelinesRow | null) ?? null });
}

export async function PUT(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }
  let body: { content?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const content = (body.content ?? "").toString();
  const notes = body.notes ? body.notes.toString() : null;
  if (!content.trim()) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  // Look for an existing row; update it if present, otherwise insert.
  const { data: existing } = await supabase
    .from("style_guidelines")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existing) {
    const { data, error } = await supabase
      .from("style_guidelines")
      .update({ content, notes, updated_at: now })
      .eq("id", (existing as { id: string }).id)
      .select("id, content, notes, updated_at")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ guidelines: data });
  }

  const { data, error } = await supabase
    .from("style_guidelines")
    .insert({ content, notes, updated_at: now })
    .select("id, content, notes, updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ guidelines: data });
}
