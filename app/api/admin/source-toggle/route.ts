import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/source-toggle { id, is_active }
 * Flips a source between active and paused. Used by the Sources admin UI.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    is_active?: boolean;
  } | null;

  if (!body?.id || typeof body.is_active !== "boolean") {
    return Response.json(
      { error: "id (string) and is_active (boolean) required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("sources")
    .update({ is_active: body.is_active })
    .eq("id", body.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
