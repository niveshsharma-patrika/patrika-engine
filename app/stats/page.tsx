import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Pipeline health page — surfaces volume + enrichment + clustering KPIs
 * at a glance so the editor doesn't have to open Supabase to know if the
 * system is healthy.
 *
 * Three blocks:
 *   1. Top counters: total / enriched / with-description / with-keywords / embedded / trends
 *   2. Per-source breakdown: total + enriched + coverage %
 *   3. Recent ingest runs: last 10 cron/manual runs with their stats
 */

type Counters = {
  total_signals: number;
  enriched: number;
  with_description: number;
  with_keywords: number;
  embedded: number;
  enrich_failed: number;
  trends_active: number;
  trends_archived: number;
  sources_active: number;
  linked_to_trend: number;
};

type IngestRun = {
  started_at: string;
  completed_at: string | null;
  trigger: string;
  status: string;
  duration_ms: number | null;
  sources_fetched: number | null;
  sources_failed: number | null;
  signals_inserted: number | null;
  trends_created: number | null;
};

type SourceStat = {
  name: string;
  language: string | null;
  total: number;
  enriched: number;
  failed: number;
  last_sync: string | null;
};

async function loadCounters(): Promise<Counters> {
  const supabase = createAdminClient();
  const sig = () => supabase.from("signals").select("id", { count: "exact", head: true });

  const [
    totalRes,
    enrichedRes,
    descRes,
    kwRes,
    embedRes,
    failedRes,
    linkedRes,
    trendActiveRes,
    trendArchivedRes,
    sourcesActiveRes,
  ] = await Promise.all([
    sig(),
    sig().not("enriched_at", "is", null),
    sig().not("description", "is", null),
    sig().not("keywords", "is", null),
    sig().not("embedding", "is", null),
    sig().eq("enrich_failed", true),
    sig().not("topic_id", "is", null),
    supabase.from("trends").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("trends").select("id", { count: "exact", head: true }).eq("status", "archived"),
    supabase.from("sources").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return {
    total_signals: totalRes.count ?? 0,
    enriched: enrichedRes.count ?? 0,
    with_description: descRes.count ?? 0,
    with_keywords: kwRes.count ?? 0,
    embedded: embedRes.count ?? 0,
    enrich_failed: failedRes.count ?? 0,
    linked_to_trend: linkedRes.count ?? 0,
    trends_active: trendActiveRes.count ?? 0,
    trends_archived: trendArchivedRes.count ?? 0,
    sources_active: sourcesActiveRes.count ?? 0,
  };
}

async function loadRecentRuns(): Promise<IngestRun[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ingest_runs")
    .select(
      "started_at, completed_at, trigger, status, duration_ms, sources_fetched, sources_failed, signals_inserted, trends_created"
    )
    .order("started_at", { ascending: false })
    .limit(10);
  return (data as IngestRun[] | null) ?? [];
}

async function loadSourceStats(): Promise<SourceStat[]> {
  const supabase = createAdminClient();
  const { data: srcs } = await supabase
    .from("sources")
    .select("id, name, language, last_sync")
    .eq("is_active", true)
    .order("name", { ascending: true });
  const sources = (srcs as Array<{ id: string; name: string; language: string | null; last_sync: string | null }> | null) ?? [];

  const out = await Promise.all(
    sources.map(async (s) => {
      const [{ count: total }, { count: enriched }, { count: failed }] = await Promise.all([
        supabase.from("signals").select("id", { count: "exact", head: true }).eq("source_id", s.id),
        supabase
          .from("signals")
          .select("id", { count: "exact", head: true })
          .eq("source_id", s.id)
          .not("enriched_at", "is", null),
        supabase
          .from("signals")
          .select("id", { count: "exact", head: true })
          .eq("source_id", s.id)
          .eq("enrich_failed", true),
      ]);
      return {
        name: s.name,
        language: s.language,
        total: total ?? 0,
        enriched: enriched ?? 0,
        failed: failed ?? 0,
        last_sync: s.last_sync,
      } satisfies SourceStat;
    })
  );
  // Sort by total desc, drop zeros so the table reads cleaner
  return out.filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
}

export default async function StatsPage() {
  const [counters, runs, sourceStats] = await Promise.all([
    loadCounters(),
    loadRecentRuns(),
    loadSourceStats(),
  ]);

  return (
    <>
      <div className="flex items-end justify-between gap-6 pb-4 mb-6 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-medium">Pipeline stats</h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1">
            How the ingest, enrichment, and clustering layers are doing.
            Numbers are live — refresh to update.
          </p>
        </div>
      </div>

      {/* ─── Counters ───────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <KpiCard label="Articles fetched (total)" value={counters.total_signals} />
        <KpiCard
          label="Enriched"
          value={counters.enriched}
          sub={pct(counters.enriched, counters.total_signals)}
        />
        <KpiCard
          label="With description"
          value={counters.with_description}
          sub={pct(counters.with_description, counters.total_signals)}
        />
        <KpiCard
          label="With keywords"
          value={counters.with_keywords}
          sub={pct(counters.with_keywords, counters.total_signals)}
        />
        <KpiCard label="Embedded" value={counters.embedded} sub={pct(counters.embedded, counters.total_signals)} />
        <KpiCard label="Enrichment failed" value={counters.enrich_failed} tone="amber" />
        <KpiCard label="Trends active" value={counters.trends_active} />
        <KpiCard label="Linked to a trend" value={counters.linked_to_trend} />
      </div>

      {/* ─── Per-source breakdown ───────────────────────────────── */}
      <h2 className="text-[15px] font-medium mb-3">Per source (today)</h2>
      <div className="bg-white border border-[var(--border)] rounded-md overflow-hidden mb-8">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--surface-2)] text-[var(--text-3)]">
            <tr>
              <Th className="text-left">Source</Th>
              <Th>Lang</Th>
              <Th>Articles</Th>
              <Th>Enriched</Th>
              <Th>%</Th>
              <Th>Failed</Th>
              <Th className="text-right">Last sync</Th>
            </tr>
          </thead>
          <tbody>
            {sourceStats.map((s) => {
              const coverage = s.total > 0 ? (s.enriched / s.total) * 100 : 0;
              return (
                <tr key={s.name} className="border-t border-[var(--border)]">
                  <Td className="text-left font-medium">{s.name}</Td>
                  <Td>{s.language?.toUpperCase() ?? "—"}</Td>
                  <Td className="font-mono">{s.total}</Td>
                  <Td className="font-mono">{s.enriched}</Td>
                  <Td className="font-mono" style={{ color: coverage >= 80 ? "var(--green)" : coverage >= 40 ? "var(--amber)" : "var(--red)" }}>
                    {coverage.toFixed(0)}%
                  </Td>
                  <Td className="font-mono" style={{ color: s.failed > 0 ? "var(--red)" : "var(--text-3)" }}>
                    {s.failed > 0 ? s.failed : "—"}
                  </Td>
                  <Td className="text-right text-[var(--text-3)] font-mono text-[11.5px]">
                    {timeAgo(s.last_sync)}
                  </Td>
                </tr>
              );
            })}
            {sourceStats.length === 0 && (
              <tr>
                <Td colSpan={7} className="text-center py-6 text-[var(--text-3)]">
                  No source data yet — wait for the first ingest tick.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Recent ingest runs ─────────────────────────────────── */}
      <h2 className="text-[15px] font-medium mb-3">Recent ingest runs</h2>
      <div className="bg-white border border-[var(--border)] rounded-md overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--surface-2)] text-[var(--text-3)]">
            <tr>
              <Th className="text-left">Started</Th>
              <Th>Trigger</Th>
              <Th>Status</Th>
              <Th>Duration</Th>
              <Th>Sources OK / err</Th>
              <Th>Added</Th>
              <Th className="text-right">Trends</Th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <Td className="text-left font-mono text-[11.5px]">
                  {timeAgo(r.started_at)}
                </Td>
                <Td>{r.trigger}</Td>
                <Td>
                  <span
                    className="px-1.5 py-0.5 rounded text-[11px] font-medium"
                    style={{
                      background:
                        r.status === "success"
                          ? "var(--green-soft)"
                          : r.status === "running"
                          ? "var(--blue-soft)"
                          : "var(--red-soft)",
                      color:
                        r.status === "success"
                          ? "var(--green)"
                          : r.status === "running"
                          ? "var(--blue)"
                          : "var(--red)",
                    }}
                  >
                    {r.status}
                  </span>
                </Td>
                <Td className="font-mono">{formatDuration(r.duration_ms)}</Td>
                <Td className="font-mono">
                  {r.sources_fetched ?? 0} / {r.sources_failed ?? 0}
                </Td>
                <Td className="font-mono">{r.signals_inserted ?? 0}</Td>
                <Td className="font-mono text-right">{r.trends_created ?? 0}</Td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <Td colSpan={7} className="text-center py-6 text-[var(--text-3)]">
                  No ingest runs recorded yet.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Local components ──────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "amber" | "red";
}) {
  const color = tone === "amber" ? "var(--amber)" : tone === "red" ? "var(--red)" : "var(--text)";
  return (
    <div className="bg-white border border-[var(--border)] rounded-md p-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium mb-1.5">
        {label}
      </div>
      <div className="text-[26px] font-medium leading-none font-mono" style={{ color }}>
        {value.toLocaleString()}
      </div>
      {sub && (
        <div className="text-[12px] text-[var(--text-3)] mt-1 font-mono">{sub}</div>
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-center text-[11px] uppercase tracking-wider font-medium px-3 py-2 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  style,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <td className={`text-center px-3 py-2 ${className}`} style={style} colSpan={colSpan}>
      {children}
    </td>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function pct(n: number, d: number): string {
  if (d === 0) return "0%";
  return `${((n / d) * 100).toFixed(0)}% of total`;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
