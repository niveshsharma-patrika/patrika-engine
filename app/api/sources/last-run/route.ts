import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/sources/last-run
 *
 * Returns a per-source breakdown of what happened during the most recent
 * ingest run. Used by /sources/last-run to show "what got fetched, what
 * was new, which sources came up empty".
 *
 * Each new ingest run replaces this view — we never aggregate across runs.
 * If a source returned 0 new items in the latest run, it shows up with
 * an empty list (which is the diagnostic value).
 */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return Response.json({ run: null, sources: [], reason: "supabase_not_configured" });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return Response.json({ run: null, sources: [], reason: "supabase_init_failed" });
  }

  type RunRow = {
    id: string;
    started_at: string;
    completed_at: string | null;
    status: string;
    trigger: string | null;
    sources_fetched: number | null;
    signals_inserted: number | null;
    clusters_found: number | null;
    clusters_refined: number | null;
    trends_created: number | null;
    trends_updated: number | null;
    trends_archived: number | null;
    duration_ms: number | null;
    error_message: string | null;
  };

  // Most recent run (running or finished).
  const { data: runRowRaw } = await supabase
    .from("ingest_runs")
    .select(
      "id, started_at, completed_at, status, trigger, sources_fetched, signals_inserted, " +
        "clusters_found, clusters_refined, trends_created, trends_updated, " +
        "trends_archived, duration_ms, error_message"
    )
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const runRow = runRowRaw as unknown as RunRow | null;

  if (!runRow) {
    return Response.json({ run: null, sources: [] });
  }

  // All active sources — even those that returned 0 — so user can see idle outlets.
  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, source_type, last_sync, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  // Window: all articles published since today's IST midnight.
  // (Previously this was scoped to the most-recent ingest run's start/end
  // window, but that only ever surfaced 1-50 incremental items — not useful
  // for browsing all of today's news.)
  const todayIstMidnight = (() => {
    const istDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    return new Date(`${istDate}T00:00:00+05:30`).toISOString();
  })();

  type SignalRow = {
    id: string;
    source_id: string;
    content: string;
    url: string | null;
    published_at: string;
    ingested_at: string;
  };
  type SourceRow = {
    id: string;
    name: string;
    source_type: string;
    last_sync: string | null;
    is_active: boolean;
  };
  const sourceList = (sources as SourceRow[] | null) ?? [];

  // EXACT per-source counts via parallel HEAD queries.
  // Why this instead of pagination: pagination caps at N rows total. When
  // Dainik Bhaskar alone produces 2,500+ articles in a day, it eats almost
  // every slot of the visible window and other sources get undercounted.
  // HEAD queries return the row count without the data, so they're cheap
  // even when a source has thousands of signals. Each query gets its own
  // count, accurate regardless of total volume.
  const countPromises = sourceList.map(async (src) => {
    const { count } = await supabase
      .from("signals")
      .select("id", { count: "exact", head: true })
      .eq("source_id", src.id)
      .gte("published_at", todayIstMidnight);
    return [src.id, count ?? 0] as const;
  });
  const countEntries = await Promise.all(countPromises);
  const countMap = new Map(countEntries);

  // Separate: fetch a sample of today's signals for the expand-row preview.
  // Capped at 2,000 (the absolute newest by publish time) — that's enough
  // to populate the top-100-per-source expand view on the page. The number
  // we display next to each source name comes from countMap above, not from
  // this sample's group size.
  const PAGE = 1000;
  const MAX_TOTAL = 2000;
  const signals: SignalRow[] = [];
  for (let offset = 0; offset < MAX_TOTAL; offset += PAGE) {
    const { data: page } = await supabase
      .from("signals")
      .select("id, source_id, content, url, published_at, ingested_at")
      .gte("published_at", todayIstMidnight)
      .order("published_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    const rows = (page as SignalRow[] | null) ?? [];
    if (rows.length === 0) break;
    signals.push(...rows);
    if (rows.length < PAGE) break;
  }

  // Group sample signals by source for the expand-view items
  const bySource = new Map<string, SignalRow[]>();
  for (const sig of signals) {
    const list = bySource.get(sig.source_id) ?? [];
    list.push(sig);
    bySource.set(sig.source_id, list);
  }

  const perSource = sourceList.map((src) => {
    const exactCount = countMap.get(src.id) ?? 0;
    const sampleSigs = bySource.get(src.id) ?? [];
    return {
      id: src.id,
      name: src.name,
      sourceType: src.source_type,
      lastSyncedAt: src.last_sync,
      newCount: exactCount, // exact, from count query
      items: sampleSigs.slice(0, 100).map((s) => ({
        id: s.id,
        headline: extractTitle(s.content),
        // url intentionally omitted — dashboard never shows raw URLs
        publishedAt: s.published_at,
        ingestedAt: s.ingested_at,
      })),
    };
  });

  perSource.sort((a, b) => {
    if (b.newCount !== a.newCount) return b.newCount - a.newCount;
    return a.name.localeCompare(b.name);
  });

  return Response.json({
    run: {
      id: runRow.id,
      startedAt: runRow.started_at,
      completedAt: runRow.completed_at,
      status: runRow.status,
      trigger: runRow.trigger,
      sourcesFetched: runRow.sources_fetched ?? 0,
      signalsInserted: runRow.signals_inserted ?? 0,
      clustersFound: runRow.clusters_found ?? 0,
      clustersRefined: runRow.clusters_refined ?? 0,
      trendsCreated: runRow.trends_created ?? 0,
      trendsUpdated: runRow.trends_updated ?? 0,
      trendsArchived: runRow.trends_archived ?? 0,
      durationMs: runRow.duration_ms,
      errorMessage: runRow.error_message,
    },
    sources: perSource,
    totalSignalsInWindow: signals.length,
  });
}

function extractTitle(content: string): string {
  return content.split(" — ")[0].slice(0, 220);
}
