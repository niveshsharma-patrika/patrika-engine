"use client";

/**
 * /sources/last-run — diagnostic view of what got fetched in the most
 * recent ingest run.
 *
 * Shows every active source with how many new items it contributed.
 * Click a source row to expand and see the actual headlines.
 *
 * Replaces itself on every new ingest run — no history kept.
 * The point is to spot sources that are silently failing or returning
 * the same items over and over.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Item = {
  id: string;
  headline: string;
  url: string | null;
  publishedAt: string;
  ingestedAt: string;
};

type SourceRow = {
  id: string;
  name: string;
  sourceType: string;
  lastSyncedAt: string | null;
  newCount: number;
  items: Item[];
};

type RunInfo = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  trigger: string | null;
  sourcesFetched: number;
  signalsInserted: number;
  clustersFound: number;
  clustersRefined: number;
  trendsCreated: number;
  trendsUpdated: number;
  trendsArchived: number;
  durationMs: number | null;
  errorMessage: string | null;
};

function fmtTime(iso: string | null, lang: "en" | "hi"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "success"
      ? "var(--green)"
      : status === "running"
      ? "var(--amber)"
      : status === "error"
      ? "var(--red)"
      : "var(--text-3)";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono">
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: color }}
      />
      {status}
    </span>
  );
}

export default function LastRunPage() {
  const { t, lang } = useLang();
  const [run, setRun] = useState<RunInfo | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/sources/last-run", { cache: "no-store" });
        const data = await r.json();
        if (cancelled) return;
        setRun(data.run ?? null);
        setSources(Array.isArray(data.sources) ? data.sources : []);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }
    load();
    // Auto-refresh every 30s so the page stays current as the cron runs.
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <section className="mb-6">
        <h1 className="text-[28px] font-bold tracking-tight mb-2">
          {t("pageLastRunTitle")}
        </h1>
        <p className="text-[14px] text-[var(--text-2)] max-w-2xl leading-relaxed">
          {t("pageLastRunSub")}
        </p>
      </section>

      {loadState === "loading" && (
        <div className="text-sm text-[var(--text-3)]">{t("loading")}</div>
      )}

      {loadState === "ready" && !run && (
        <div className="border border-dashed border-[var(--border)] rounded-lg p-12 text-center">
          <p className="text-[14px] text-[var(--text-2)]">{t("lastRunNoData")}</p>
        </div>
      )}

      {loadState === "ready" && run && (
        <>
          {/* Run summary panel */}
          <div className="bg-white border border-[var(--border)] rounded-md p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)] mb-1">
                {t("lastRunStatus")}
              </div>
              <StatusBadge status={run.status} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)] mb-1">
                {t("lastRunStarted")}
              </div>
              <div className="font-mono">{fmtTime(run.startedAt, lang)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)] mb-1">
                {t("lastRunCompleted")}
              </div>
              <div className="font-mono">
                {fmtTime(run.completedAt, lang)}
                {run.durationMs != null && (
                  <span className="text-[var(--text-3)] ml-1.5">
                    · {fmtDuration(run.durationMs)}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)] mb-1">
                {lang === "hi" ? "नए सिग्नल" : "Signals inserted"}
              </div>
              <div className="font-mono font-medium text-[var(--text)]">
                {run.signalsInserted}
              </div>
            </div>

            <div className="col-span-2 md:col-span-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 md:grid-cols-6 gap-3 text-[11px]">
              <Stat label={lang === "hi" ? "स्रोत" : "Sources"} value={run.sourcesFetched} />
              <Stat label={lang === "hi" ? "क्लस्टर" : "Clusters"} value={run.clustersFound} />
              <Stat label={lang === "hi" ? "रिफ़ाइन" : "Refined"} value={run.clustersRefined} />
              <Stat label={lang === "hi" ? "नए ट्रेंड" : "Created"} value={run.trendsCreated} />
              <Stat label={lang === "hi" ? "अपडेट" : "Updated"} value={run.trendsUpdated} />
              <Stat label={lang === "hi" ? "आर्काइव" : "Archived"} value={run.trendsArchived} />
            </div>

            {run.errorMessage && (
              <div className="col-span-2 md:col-span-4 text-[12px] text-[var(--red)] bg-[var(--red-soft)] px-3 py-2 rounded">
                {run.errorMessage}
              </div>
            )}
          </div>

          {/* Per-source breakdown */}
          <div className="bg-white border border-[var(--border)] rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_90px_90px_60px] gap-3 px-4 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-3)] font-medium">
              <div>{t("colSource")}</div>
              <div className="text-right">{t("colNew")}</div>
              <div className="text-right">{lang === "hi" ? "टाइप" : "Type"}</div>
              <div></div>
            </div>
            <ul className="divide-y divide-[var(--border)] list-none m-0 p-0">
              {sources.map((src) => {
                const isOpen = expanded.has(src.id);
                const isIdle = src.newCount === 0;
                return (
                  <li key={src.id}>
                    <button
                      onClick={() => toggleExpand(src.id)}
                      disabled={isIdle}
                      className={`w-full grid grid-cols-[1fr_90px_90px_60px] gap-3 px-4 py-2.5 text-left text-[13px] items-center ${
                        isIdle
                          ? "text-[var(--text-3)]"
                          : "hover:bg-[var(--surface-2)] cursor-pointer"
                      }`}
                    >
                      <div className="truncate">{src.name}</div>
                      <div
                        className={`text-right font-mono ${
                          isIdle ? "text-[var(--text-3)]" : "text-[var(--text)] font-medium"
                        }`}
                      >
                        {src.newCount}
                      </div>
                      <div className="text-right font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
                        {src.sourceType === "google_news" ? "GN" : src.sourceType}
                      </div>
                      <div className="text-right text-[var(--text-3)]">
                        {!isIdle && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                      </div>
                    </button>
                    {isOpen && src.items.length > 0 && (
                      <div className="px-4 py-3 bg-[var(--surface-2)] border-t border-[var(--border)]">
                        <ul className="space-y-2 list-none m-0 p-0">
                          {src.items.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-start gap-3 text-[12.5px] leading-snug"
                            >
                              <div className="font-mono text-[10px] text-[var(--text-3)] whitespace-nowrap mt-0.5 w-14 text-right">
                                {fmtTime(item.ingestedAt, lang).split(" ")[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-[var(--text)]">{item.headline}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                        {src.newCount > src.items.length && (
                          <div className="text-[11px] text-[var(--text-3)] mt-2 italic">
                            {lang === "hi"
                              ? `+ ${src.newCount - src.items.length} और`
                              : `+ ${src.newCount - src.items.length} more`}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {loadState === "error" && (
        <div className="text-sm text-[var(--red)]">
          {lang === "hi" ? "लोड नहीं हो सका।" : "Could not load."}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)] mb-0.5">
        {label}
      </div>
      <div className="font-mono text-[13px] text-[var(--text)]">{value}</div>
    </div>
  );
}
