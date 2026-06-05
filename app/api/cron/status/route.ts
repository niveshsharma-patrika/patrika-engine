import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "success" | "error";
  trigger: "cron" | "manual" | "unknown";
  signals_inserted: number | null;
  trends_created: number | null;
  trends_updated: number | null;
  duration_ms: number | null;
  error_message: string | null;
};

/**
 * Lightweight, cacheable-on-client status feed.
 * Returns the most recent ingestion run + derived state:
 *
 *   state ∈ { running, idle, stuck, error, never }
 *
 * "stuck" = status='running' and started_at > STUCK_AFTER_MS ago.
 * "idle"  = last run succeeded, sitting between cron ticks.
 */
export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ state: "never", reason: "supabase_not_configured" });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ingest_runs")
    .select(
      "id, started_at, completed_at, status, trigger, signals_inserted, trends_created, trends_updated, duration_ms, error_message"
    )
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return Response.json(
      { state: "never", reason: "query_failed", error: error.message },
      { status: 200 }
    );
  }

  if (!data) {
    return Response.json({ state: "never" });
  }

  const run = data as RunRow;
  const STUCK_AFTER_MS = 5 * 60 * 1000; // 5 min — generous; typical run is 30-70s
  const ageMs = Date.now() - new Date(run.started_at).getTime();

  let state: "running" | "idle" | "stuck" | "error";
  if (run.status === "error") {
    state = "error";
  } else if (run.status === "running") {
    state = ageMs > STUCK_AFTER_MS ? "stuck" : "running";
  } else {
    state = "idle";
  }

  return Response.json({
    state,
    started_at: run.started_at,
    completed_at: run.completed_at,
    age_ms: ageMs,
    trigger: run.trigger,
    duration_ms: run.duration_ms,
    signals_inserted: run.signals_inserted,
    trends_created: run.trends_created,
    trends_updated: run.trends_updated,
    error_message: run.error_message,
  });
}
