import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Dev-only: delete sources with NULL urls (legacy duplicates from old migration).
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("sources")
    .delete({ count: "exact" })
    .is("url", null);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, deleted: count ?? 0 });
}
