import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Dev-only: wipe all trends and unlink signals so the next ingestion
 * pass re-clusters from scratch with the current algorithm.
 *
 * Signals themselves are preserved.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { error: unlinkErr } = await supabase
    .from("signals")
    .update({ topic_id: null })
    .not("topic_id", "is", null);
  if (unlinkErr) {
    return Response.json({ error: unlinkErr.message }, { status: 500 });
  }

  const { error: delErr, count } = await supabase
    .from("trends")
    .delete({ count: "exact" })
    .gte("first_seen", "1970-01-01");
  if (delErr) {
    return Response.json({ error: delErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, trends_deleted: count ?? 0 });
}
