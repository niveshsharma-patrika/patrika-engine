"use client";

/**
 * /today — daily digest of trends.
 *
 * Pulls /api/trends?window=today which returns active + archived trends from
 * the last 24 hours, sorted by signal_count desc (biggest stories first).
 *
 * Visual difference from / (the live dashboard):
 *   - 24h window instead of 60min freshness rule
 *   - Cards past the 60min freshness mark are dimmed
 *   - Sorting is by volume, not velocity
 *
 * Generate flow: clicking "Generate" routes to / with query params,
 * letting the dashboard's editor handle the actual draft creation.
 * Keeps /today focused on the digest.
 */

import { useEffect, useState } from "react";

import { useLang } from "@/lib/i18n/context";
import { TrendCard } from "@/components/trend-card";
import { TrendDrawer } from "@/components/trend-drawer";
import type { Trend } from "@/lib/data/trends";

// Threshold above which a trend on /today is shown as "dimmed" (no longer live).
// Matches the live dashboard's freshness rule so the boundary is consistent.
const STALE_MIN_THRESHOLD = 60;

export default function TodayPage() {
  const { t, lang } = useLang();
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [openTrend, setOpenTrend] = useState<Trend | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/trends?window=today", { cache: "no-store" });
        const data = await r.json();
        if (cancelled) return;
        setTrends(Array.isArray(data.trends) ? (data.trends as Trend[]) : []);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight mb-2">
          {t("pageTodayTitle")}
        </h1>
        <p className="text-[14px] text-[var(--text-2)] max-w-2xl leading-relaxed">
          {t("pageTodaySub")}
        </p>
      </section>

      {loadState === "loading" && (
        <div className="text-sm text-[var(--text-3)]">{t("loading")}</div>
      )}

      {loadState === "ready" && trends.length === 0 && (
        <div className="border border-dashed border-[var(--border)] rounded-lg p-12 text-center">
          <p className="text-[14px] text-[var(--text-2)]">{t("todayEmpty")}</p>
        </div>
      )}

      {loadState === "ready" && trends.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trends.map((trend) => {
            const isStale =
              trend.lastSeenMinAgo != null &&
              trend.lastSeenMinAgo > STALE_MIN_THRESHOLD;
            return (
              <div key={trend.id} className="relative">
                <TrendCard
                  trend={trend}
                  dimmed={isStale}
                  onClick={() => setOpenTrend(trend)}
                />
                {isStale && (
                  <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-3)] border border-[var(--border)]">
                    {t("noLongerLive")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {loadState === "error" && (
        <div className="text-sm text-[var(--red)]">
          {lang === "hi" ? "लोड नहीं हो सका।" : "Could not load."}
        </div>
      )}

      {openTrend && (
        <TrendDrawer
          trend={openTrend}
          onClose={() => setOpenTrend(null)}
          onGenerate={() => {}}
          readOnly
        />
      )}
    </>
  );
}
