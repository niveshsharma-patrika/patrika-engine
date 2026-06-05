import { SourceTable, type SourceRow } from "@/components/source-table";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadSources(): Promise<SourceRow[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sources")
    .select("id, name, source_type, url, handle, desk, focus, language, is_active, last_sync, signals_24h")
    .order("is_active", { ascending: false })
    .order("focus", { ascending: true })
    .order("name", { ascending: true });
  return (data as Omit<SourceRow, "signals_24h">[] | null)?.map((s) => ({
    ...s,
    signals_24h: 0, // placeholder; real value comes from loadSignalCounts below
  })) ?? [];
}

async function loadSignalCounts(
  sourceIds: string[]
): Promise<Record<string, number>> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || sourceIds.length === 0) return {};
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Per-source exact-count HEAD queries instead of pulling rows.
  // The previous approach (.select("source_id") with no limit) hits Supabase's
  // 1000-row cap, so when Bhaskar alone has 2,800+ signals other sources got
  // counted as 0 and incorrectly marked "Idle". HEAD queries return only the
  // count, never row data — accurate regardless of volume.
  const counts: Record<string, number> = {};
  await Promise.all(
    sourceIds.map(async (id) => {
      const { count } = await supabase
        .from("signals")
        .select("id", { count: "exact", head: true })
        .eq("source_id", id)
        .gte("ingested_at", since);
      counts[id] = count ?? 0;
    })
  );
  return counts;
}

export default async function SourcesPage() {
  const sources = await loadSources();
  const counts = await loadSignalCounts(sources.map((s) => s.id));

  // Merge real signal counts in
  const rows: SourceRow[] = sources.map((s) => ({
    ...s,
    signals_24h: counts[s.id] ?? 0,
  }));

  const totals = {
    all: rows.length,
    active: rows.filter((s) => s.is_active).length,
    contributing: rows.filter((s) => s.signals_24h > 0).length,
  };

  return (
    <>
      <div className="flex items-end justify-between gap-6 pb-4 mb-6 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-medium">Sources</h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1">
            {totals.all} configured · {totals.active} active · {totals.contributing} contributing in 24h
          </p>
        </div>
        <button className="bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[13px] font-medium px-4 py-2 rounded">
          + Add source
        </button>
      </div>

      <SourceTable rows={rows} />

      <div className="mt-6 text-[12px] text-[var(--text-3)] leading-relaxed max-w-3xl">
        <p className="mb-2">
          <b className="text-[var(--text)] font-medium">Live</b> — feed responded
          and produced signals in the last 24h.
        </p>
        <p className="mb-2">
          <b className="text-[var(--text)] font-medium">Idle</b> — feed responds
          OK but didn&apos;t produce new signals in 24h. Slow news cycle, or content
          mostly stuck behind a paywall / dedupe.
        </p>
        <p className="mb-2">
          <b className="text-[var(--text)] font-medium">Waitlist</b> — Twitter
          via xcancel.com, waiting on the email approval. Will flip to Live
          automatically once approved.
        </p>
        <p>
          <b className="text-[var(--text)] font-medium">Paused</b> — deactivated
          (broken URL, 403, malformed XML). Click <em>Re-activate</em> to retry —
          useful if a site fixes its feed.
        </p>
      </div>
    </>
  );
}
