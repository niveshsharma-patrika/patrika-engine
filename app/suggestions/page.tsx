import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TrendRow = {
  id: string;
  title: string;
  section: string | null;
  desk: string | null;
  velocity_pct: number | null;
  velocity_window: string | null;
  suggested_angle: string | null;
  signal_count: number | null;
};

async function loadTrends(): Promise<TrendRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("trends")
    .select("id, title, section, desk, velocity_pct, velocity_window, suggested_angle, signal_count")
    .eq("status", "active")
    .not("suggested_angle", "is", null)
    .order("signal_count", { ascending: false })
    .limit(30);
  return (data as TrendRow[] | null) ?? [];
}

const SECTION_COLORS: Record<string, string> = {
  city: "var(--red)",
  business: "var(--blue)",
  sports: "var(--green)",
  politics: "var(--orange)",
  weather: "var(--amber)",
  enter: "var(--purple)",
  tech: "var(--blue)",
  national: "var(--text)",
};

export default async function SuggestionsPage() {
  const trends = await loadTrends();

  return (
    <>
      <div className="flex items-end justify-between gap-6 pb-4 mb-6 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-medium">Editorial Suggestions</h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1">
            {trends.length} stories worth writing right now — AI-curated angle for each.
          </p>
        </div>
      </div>

      {trends.length === 0 ? (
        <div className="bg-white border border-[var(--border)] rounded-md p-10 text-center">
          <p className="text-[var(--text-2)] text-sm">No suggestions yet.</p>
          <p className="text-[var(--text-3)] text-[13px] mt-2">
            Run the ingestion pipeline (Admin → Sync now) and trending stories will appear here with editorial angles.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {trends.map((t) => (
            <article
              key={t.id}
              className="bg-white border border-[var(--border)] hover:border-[var(--border-2)] rounded-md p-5 transition-all hover:shadow-sm"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: SECTION_COLORS[t.section ?? "national"] ?? "var(--text)" }}
                  />
                  {t.desk ?? t.section ?? "National"}
                </span>
                <span className="font-mono text-[12px] font-medium text-[var(--red)]">
                  {t.signal_count ?? 0} {(t.signal_count ?? 0) === 1 ? "source" : "sources"}
                </span>
              </div>
              <h3 className="text-[17px] font-medium leading-snug mb-3">{t.title}</h3>
              {t.suggested_angle && (
                <div className="bg-[var(--red-soft)] p-3 rounded text-[12.5px] leading-relaxed text-[var(--text)] mb-4">
                  {t.suggested_angle}
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                <span className="text-[11px] text-[var(--text-3)] font-mono">
                  {t.signal_count} {t.signal_count === 1 ? "signal" : "signals"}
                </span>
                <button className="bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[12px] font-medium px-3.5 py-1.5 rounded">
                  Generate draft →
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
