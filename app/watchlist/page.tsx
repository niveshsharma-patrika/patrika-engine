import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type WatchRow = {
  id: string;
  name: string;
  entity_type: "person" | "organization" | "brand";
  handles: string[];
  alerts_enabled: boolean;
  hits_30d: number;
  last_hit: string | null;
  created_at: string;
};

async function loadWatchlist(): Promise<WatchRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("watchlist")
    .select("id, name, entity_type, handles, alerts_enabled, hits_30d, last_hit, created_at")
    .order("hits_30d", { ascending: false });
  return (data as WatchRow[] | null) ?? [];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const TYPE_COLORS: Record<string, string> = {
  person: "#6e2a4f",
  organization: "var(--blue)",
  brand: "var(--green)",
};

export default async function WatchlistPage() {
  const watchlist = await loadWatchlist();

  return (
    <>
      <div className="flex items-end justify-between gap-6 pb-4 mb-6 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-medium">Watchlist</h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1">
            {watchlist.length} entries · {watchlist.filter((w) => w.alerts_enabled).length} with alerts on
          </p>
        </div>
        <button className="bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[13px] font-medium px-4 py-2 rounded">
          + Add to watchlist
        </button>
      </div>

      {watchlist.length === 0 ? (
        <div className="bg-white border border-[var(--border)] rounded-md p-10 text-center">
          <p className="text-[var(--text-2)] text-sm">Watchlist is empty.</p>
          <p className="text-[var(--text-3)] text-[13px] mt-2 max-w-md mx-auto">
            Add people, brands, or organizations. When they post — and Twitter ingestion is live — you&apos;ll get a flagged signal and a suggested draft.
          </p>
          <button className="mt-5 bg-[var(--text)] hover:bg-black text-white text-[13px] font-medium px-4 py-2 rounded">
            Add your first entry
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[var(--border)] rounded-md overflow-hidden">
          <div className="grid grid-cols-[36px_1fr_110px_1fr_80px_90px_80px] gap-3.5 px-4 py-2.5 bg-[var(--surface-2)] text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium">
            <div></div>
            <div>Name</div>
            <div>Type</div>
            <div>Handles</div>
            <div className="text-right">Hits / 30d</div>
            <div>Last hit</div>
            <div>Alerts</div>
          </div>
          {watchlist.map((w) => (
            <div
              key={w.id}
              className="grid grid-cols-[36px_1fr_110px_1fr_80px_90px_80px] gap-3.5 px-4 py-3 items-center border-t border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <div
                className="w-9 h-9 grid place-items-center rounded-full text-[12px] font-medium text-white"
                style={{ background: TYPE_COLORS[w.entity_type] ?? "var(--text)" }}
              >
                {w.name.split(" ").map((n) => n[0]?.toUpperCase()).slice(0, 2).join("")}
              </div>
              <div className="text-sm font-medium">{w.name}</div>
              <div className="font-mono text-[11px] text-[var(--text-2)] uppercase tracking-wider">
                {w.entity_type}
              </div>
              <div className="font-mono text-[11px] text-[var(--text-2)] truncate">
                {(w.handles ?? []).join(", ")}
              </div>
              <div className="font-mono text-sm font-medium text-right">{w.hits_30d}</div>
              <div className="font-mono text-[11px] text-[var(--text-3)]">{timeAgo(w.last_hit)}</div>
              <div>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    w.alerts_enabled
                      ? "bg-[var(--green-soft)] text-[var(--green)]"
                      : "bg-[var(--surface-2)] text-[var(--text-3)]"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {w.alerts_enabled ? "On" : "Off"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
