import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Dev-only nuclear reset: wipes signals, trends, and ingest_runs so the
 * next ingestion pass starts from a clean slate. Sources, AI config, and
 * users are preserved.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const results: Record<string, number | string> = {};

  // Order matters: signals reference trends; ingest_runs is independent.
  const sigDel = await supabase
    .from("signals")
    .delete({ count: "exact" })
    .gte("ingested_at", "1970-01-01");
  results.signals_deleted = sigDel.error ? sigDel.error.message : sigDel.count ?? 0;

  const trDel = await supabase
    .from("trends")
    .delete({ count: "exact" })
    .gte("first_seen", "1970-01-01");
  results.trends_deleted = trDel.error ? trDel.error.message : trDel.count ?? 0;

  const runDel = await supabase
    .from("ingest_runs")
    .delete({ count: "exact" })
    .gte("started_at", "1970-01-01");
  results.runs_deleted = runDel.error ? runDel.error.message : runDel.count ?? 0;

  // Reset per-source counters
  const srcReset = await supabase
    .from("sources")
    .update({ signals_24h: 0, last_sync: null })
    .gte("created_at", "1970-01-01");
  results.sources_reset = srcReset.error ? srcReset.error.message : "ok";

  return Response.json({ ok: true, ...results });
}
