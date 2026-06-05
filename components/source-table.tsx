"use client";

import { useMemo, useState, useTransition } from "react";

export type SourceRow = {
  id: string;
  name: string;
  source_type: "rss" | "twitter" | "google_news" | "sitemap_news";
  url: string | null;
  handle: string | null;
  desk: string | null;
  focus: string | null;       // 'general' | 'business' | 'tech' | 'magazine' | 'regional' | 'sports' | 'entertainment'
  language: string | null;    // 'en' | 'hi' | 'bilingual'
  is_active: boolean;
  last_sync: string | null;
  signals_24h: number;
};

type StatusKey = "all" | "live" | "idle" | "paused" | "waitlist";
type FocusKey = "all" | "general" | "business" | "tech" | "magazine" | "regional" | "sports" | "entertainment";
type LangKey = "all" | "en" | "hi" | "bilingual";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function statusFor(s: SourceRow): StatusKey {
  if (!s.is_active) return "paused";
  // Twitter sources without recent signals = waitlist for xcancel approval
  if (s.source_type === "twitter" && s.signals_24h === 0) return "waitlist";
  if (s.signals_24h > 0) return "live";
  return "idle";
}

export function SourceTable({ rows: initial }: { rows: SourceRow[] }) {
  const [rows, setRows] = useState(initial);
  const [statusFilter, setStatusFilter] = useState<StatusKey>("live");
  const [focusFilter, setFocusFilter] = useState<FocusKey>("all");
  const [langFilter, setLangFilter] = useState<LangKey>("all");
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const enriched = useMemo(
    () => rows.map((r) => ({ ...r, _status: statusFor(r) })),
    [rows]
  );

  const statusCounts: Record<StatusKey, number> = {
    all: enriched.length,
    live: enriched.filter((r) => r._status === "live").length,
    idle: enriched.filter((r) => r._status === "idle").length,
    paused: enriched.filter((r) => r._status === "paused").length,
    waitlist: enriched.filter((r) => r._status === "waitlist").length,
  };

  // Counts for focus chips reflect the rows that pass the OTHER two filters
  // (so toggling a focus chip never lies about how many rows it would show).
  const passStatus = (r: (typeof enriched)[number]) =>
    statusFilter === "all" || r._status === statusFilter;
  const passLang = (r: (typeof enriched)[number]) =>
    langFilter === "all" || (r.language ?? "en") === langFilter;
  const passFocus = (r: (typeof enriched)[number]) =>
    focusFilter === "all" || (r.focus ?? "general") === focusFilter;

  const focusCounts: Record<FocusKey, number> = {
    all: enriched.filter((r) => passStatus(r) && passLang(r)).length,
    general: 0, business: 0, tech: 0, magazine: 0,
    regional: 0, sports: 0, entertainment: 0,
  };
  for (const r of enriched) {
    if (passStatus(r) && passLang(r)) {
      const f = (r.focus ?? "general") as FocusKey;
      if (f in focusCounts) focusCounts[f]++;
    }
  }

  const langCounts: Record<LangKey, number> = {
    all: enriched.filter((r) => passStatus(r) && passFocus(r)).length,
    en: 0, hi: 0, bilingual: 0,
  };
  for (const r of enriched) {
    if (passStatus(r) && passFocus(r)) {
      const l = (r.language ?? "en") as LangKey;
      if (l in langCounts) langCounts[l]++;
    }
  }

  const visible = enriched.filter((r) => passStatus(r) && passFocus(r) && passLang(r));

  async function toggle(id: string, next: boolean) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch("/api/admin/source-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: next }),
      });
      if (res.ok) {
        startTransition(() => {
          setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, is_active: next } : r))
          );
        });
      }
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
    { key: "live", label: "Live" },
    { key: "idle", label: "Idle" },
    { key: "waitlist", label: "Waitlist" },
    { key: "paused", label: "Paused" },
    { key: "all", label: "All" },
  ];

  const FOCUS_FILTERS: { key: FocusKey; label: string }[] = [
    { key: "all", label: "All focus" },
    { key: "general", label: "General" },
    { key: "business", label: "Business" },
    { key: "tech", label: "Tech" },
    { key: "magazine", label: "Magazine" },
    { key: "regional", label: "Regional" },
    { key: "sports", label: "Sports" },
    { key: "entertainment", label: "Entertainment" },
  ];

  const LANG_FILTERS: { key: LangKey; label: string }[] = [
    { key: "all", label: "All langs" },
    { key: "en", label: "English" },
    { key: "hi", label: "Hindi" },
    { key: "bilingual", label: "Bilingual" },
  ];

  function chipClass<T extends string>(active: T, key: T) {
    return `text-[12px] font-medium px-2.5 py-1 rounded-full border transition-all ${
      active === key
        ? "bg-[var(--text)] border-[var(--text)] text-white"
        : "bg-white border-[var(--border)] text-[var(--text-2)] hover:border-[var(--border-2)] hover:text-[var(--text)]"
    }`;
  }

  function countClass<T extends string>(active: T, key: T) {
    return `font-mono text-[10.5px] ml-1.5 ${
      active === key ? "text-white/65" : "text-[var(--text-3)]"
    }`;
  }

  return (
    <>
      {/* Status filters (Live / Idle / Paused …) */}
      <div className="flex gap-2 flex-wrap mb-2.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={chipClass(statusFilter, f.key)}
          >
            {f.label}
            <span className={countClass(statusFilter, f.key)}>
              {statusCounts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Focus filters */}
      <div className="flex gap-2 flex-wrap mb-2.5">
        {FOCUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFocusFilter(f.key)}
            className={chipClass(focusFilter, f.key)}
            disabled={f.key !== "all" && focusCounts[f.key] === 0}
            style={
              f.key !== "all" && focusCounts[f.key] === 0
                ? { opacity: 0.4, cursor: "not-allowed" }
                : undefined
            }
          >
            {f.label}
            <span className={countClass(focusFilter, f.key)}>
              {focusCounts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Language filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        {LANG_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setLangFilter(f.key)}
            className={chipClass(langFilter, f.key)}
            disabled={f.key !== "all" && langCounts[f.key] === 0}
            style={
              f.key !== "all" && langCounts[f.key] === 0
                ? { opacity: 0.4, cursor: "not-allowed" }
                : undefined
            }
          >
            {f.label}
            <span className={countClass(langFilter, f.key)}>
              {langCounts[f.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-[var(--border)] rounded-md overflow-hidden">
        <div className="grid grid-cols-[36px_1fr_90px_110px_100px_70px_80px] gap-3.5 px-4 py-2.5 bg-[var(--surface-2)] text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium">
          <div></div>
          <div>Source</div>
          <div>Type</div>
          <div>Status</div>
          <div>Last sync</div>
          <div className="text-right">24h</div>
          <div></div>
        </div>

        {visible.length === 0 && (
          <div className="px-4 py-8 text-center text-[var(--text-3)] text-sm">
            No sources in this view.
          </div>
        )}

        {visible.map((s) => {
          const typeColor =
            s.source_type === "twitter"
              ? "var(--text)"
              : s.source_type === "rss"
              ? "var(--orange)"
              : s.source_type === "sitemap_news"
              ? "var(--purple)"
              : "var(--blue)";
          const typeLabel =
            s.source_type === "google_news"
              ? "GN"
              : s.source_type === "twitter"
              ? "X"
              : s.source_type === "sitemap_news"
              ? "SM"
              : "RSS";

          const chipStyle: Record<StatusKey, string> = {
            live: "bg-[var(--green-soft)] text-[var(--green)]",
            idle: "bg-[var(--orange-soft)] text-[#b06000]",
            waitlist: "bg-[var(--blue-soft)] text-[#1967d2]",
            paused: "bg-[var(--surface-2)] text-[var(--text-3)]",
            all: "",
          };
          const chipLabel: Record<StatusKey, string> = {
            live: "Live",
            idle: "Idle",
            waitlist: "Waitlist",
            paused: "Paused",
            all: "",
          };
          const st = s._status as StatusKey;
          const focus = s.focus ?? "general";
          const language = (s.language ?? "en").toUpperCase();

          return (
            <div
              key={s.id}
              className="grid grid-cols-[36px_1fr_90px_110px_100px_70px_80px] gap-3.5 px-4 py-3 items-center border-t border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <div
                className="w-9 h-9 grid place-items-center rounded text-[11px] font-mono font-semibold text-white"
                style={{ background: typeColor }}
              >
                {typeLabel}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  <span className="truncate">{s.name}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-px rounded bg-[var(--surface-2)] text-[var(--text-2)]">
                    {focus}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-px rounded bg-[var(--surface-2)] text-[var(--text-2)]">
                    {language}
                  </span>
                </div>
                {s.desk && (
                  <div className="text-[11px] text-[var(--text-3)] mt-0.5">{s.desk}</div>
                )}
              </div>
              <div className="font-mono text-[11px] text-[var(--text-2)] uppercase tracking-wider">
                {s.source_type === "google_news"
                  ? "Google News"
                  : s.source_type === "sitemap_news"
                  ? "Sitemap"
                  : s.source_type}
              </div>
              <div>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${chipStyle[st]}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {chipLabel[st]}
                </span>
              </div>
              <div className="font-mono text-[11px] text-[var(--text-3)]">
                {timeAgo(s.last_sync)}
              </div>
              <div className="font-mono text-sm font-medium text-right">
                {s.signals_24h}
              </div>
              <div>
                <button
                  onClick={() => toggle(s.id, !s.is_active)}
                  disabled={busy[s.id]}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded border transition-all ${
                    s.is_active
                      ? "bg-white border-[var(--border)] text-[var(--text-2)] hover:border-[var(--red)] hover:text-[var(--red)]"
                      : "bg-[var(--red)] border-[var(--red)] text-white hover:bg-[var(--red-hover)]"
                  } ${busy[s.id] ? "opacity-50 cursor-wait" : ""}`}
                >
                  {busy[s.id]
                    ? "…"
                    : s.is_active
                    ? "Pause"
                    : "Re-activate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
