import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Dev-only: per-source health audit.
 * Returns:
 *   - active vs paused source counts (split by type)
 *   - sources with ≥1 signal in the last 24h ("contributing")
 *   - sources with zero signals despite being active ("silent")
 *   - sources never synced
 *   - last_sync recency buckets
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: "Supabase not configured" });
  }

  const supabase = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // All sources
  const { data: sourcesRaw } = await supabase
    .from("sources")
    .select("id, name, source_type, is_active, last_sync");
  type Src = {
    id: string;
    name: string;
    source_type: string;
    is_active: boolean;
    last_sync: string | null;
  };
  const sources = (sourcesRaw as Src[] | null) ?? [];

  // Signal counts in the last 24h
  const { data: signals24h } = await supabase
    .from("signals")
    .select("source_id")
    .gte("ingested_at", since);
  const counts24h: Record<string, number> = {};
  for (const row of (signals24h as { source_id: string }[] | null) ?? []) {
    counts24h[row.source_id] = (counts24h[row.source_id] ?? 0) + 1;
  }

  // Total signals per source (all time)
  const { data: allSigs } = await supabase
    .from("signals")
    .select("source_id");
  const totals: Record<string, number> = {};
  for (const row of (allSigs as { source_id: string }[] | null) ?? []) {
    totals[row.source_id] = (totals[row.source_id] ?? 0) + 1;
  }

  const byType: Record<string, { active: number; inactive: number; contributing24h: number }> = {};
  const contributing: Array<{ name: string; type: string; count24h: number; total: number }> = [];
  const silentActive: Array<{ name: string; type: string; lastSync: string | null; total: number }> = [];
  const neverSynced: Array<{ name: string; type: string }> = [];

  for (const s of sources) {
    if (!byType[s.source_type]) byType[s.source_type] = { active: 0, inactive: 0, contributing24h: 0 };
    if (s.is_active) byType[s.source_type].active++;
    else byType[s.source_type].inactive++;
    const c24 = counts24h[s.id] ?? 0;
    if (c24 > 0) byType[s.source_type].contributing24h++;

    if (s.is_active) {
      if (c24 > 0) {
        contributing.push({
          name: s.name,
          type: s.source_type,
          count24h: c24,
          total: totals[s.id] ?? 0,
        });
      } else if (!s.last_sync) {
        neverSynced.push({ name: s.name, type: s.source_type });
      } else {
        silentActive.push({
          name: s.name,
          type: s.source_type,
          lastSync: s.last_sync,
          total: totals[s.id] ?? 0,
        });
      }
    }
  }

  contributing.sort((a, b) => b.count24h - a.count24h);
  silentActive.sort((a, b) => (b.total - a.total));

  return Response.json({
    summary: {
      total_sources: sources.length,
      active: sources.filter((s) => s.is_active).length,
      contributing_24h: contributing.length,
      silent_active: silentActive.length,
      never_synced: neverSynced.length,
      total_signals_24h: signals24h?.length ?? 0,
    },
    by_type: byType,
    contributing,
    silent_active: silentActive,
    never_synced: neverSynced,
  });
}
