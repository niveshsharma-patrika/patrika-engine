"use client";

/**
 * Shared trend-card primitives used on both the live dashboard (/) and
 * the daily digest page (/today).
 *
 * Lives outside app/page.tsx so /today can reuse exactly the same visual
 * vocabulary without duplicating code.
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { SECTION_COLORS, type Trend } from "@/lib/data/trends";

/** Minutes-ago → human label. Caps at 60min ("now" view) but the helper
 * still handles hours so it works on /today where trends can be older. */
export function freshness(minAgo: number | undefined, lang: "en" | "hi"): string {
  if (minAgo == null) return "—";
  if (lang === "hi") {
    if (minAgo < 1) return "अभी";
    if (minAgo < 60) return `${minAgo}मि पहले`;
    return `${Math.round(minAgo / 60)}घं पहले`;
  }
  if (minAgo < 1) return "just now";
  if (minAgo < 60) return `${minAgo}m ago`;
  return `${Math.round(minAgo / 60)}h ago`;
}

export function SourcePill({ src }: { src: "x" | "rss" | "gn" }) {
  const classes: Record<string, string> = {
    x: "bg-[var(--text)] text-white",
    rss: "bg-[var(--orange)] text-white",
    gn: "bg-[var(--blue)] text-white",
  };
  const labels: Record<string, string> = { x: "X", rss: "RSS", gn: "GN" };
  return (
    <span
      className={`font-mono text-[9px] font-semibold px-1.5 py-[2px] rounded-[3px] tracking-wider leading-[1.5] ${classes[src]}`}
    >
      {labels[src]}
    </span>
  );
}

export function TrustPips({ score }: { score: number }) {
  return (
    <span className="inline-flex gap-[3px] items-center">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[7px] h-[7px] rounded-full"
          style={{ background: i < score ? "var(--green)" : "var(--border)" }}
        />
      ))}
    </span>
  );
}

/** A single trending-story card. `dimmed` greys it down to signal
 * "this was trending earlier today but is no longer live". */
export function TrendCard({
  trend,
  onClick,
  dimmed = false,
}: {
  trend: Trend;
  onClick: () => void;
  dimmed?: boolean;
}) {
  const { lang } = useLang();
  const [imgOk, setImgOk] = useState(true);
  const title = lang === "hi" && trend.title_hi ? trend.title_hi : trend.title;
  const tag = lang === "hi" && trend.desk_hi ? trend.desk_hi : trend.tag;
  const lastSeen = freshness(trend.lastSeenMinAgo, lang);

  // Dimmed = the trend is past its freshness window. Mute the velocity
  // colour and lower opacity, but keep clickable + readable.
  const velocityColor = dimmed ? "text-[var(--text-3)]" : "text-[var(--red)]";
  const cardOpacity = dimmed ? "opacity-70" : "";

  return (
    <button
      onClick={onClick}
      className={`relative bg-white border border-[var(--border)] hover:border-[var(--border-2)] rounded-md text-left flex flex-col min-h-[168px] transition-all overflow-hidden group hover:shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.04)] ${cardOpacity}`}
    >
      <span
        className="absolute top-0 left-0 right-0 h-[3px] z-10"
        style={{
          background: dimmed ? "var(--border-2)" : SECTION_COLORS[trend.section],
        }}
      />
      {trend.image && imgOk && (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--surface-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={trend.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${dimmed ? "grayscale opacity-80" : ""}`}
          />
        </div>
      )}
      <div className="p-5 pt-4 pb-3.5 flex flex-col gap-2.5 flex-1">
        <div className="flex justify-between items-baseline gap-3">
          <span className="text-[10.5px] uppercase tracking-wider text-[var(--text-3)] font-medium">
            {tag}
          </span>
          <span className={`font-mono text-[13px] font-medium ${velocityColor} whitespace-nowrap`}>
            {trend.signalCount} {trend.signalCount === 1 ? "source" : "sources"}
            <span className="text-[var(--text-3)] ml-1.5 font-normal">· {lastSeen}</span>
          </span>
        </div>
        <h3 className="text-[18px] font-medium leading-snug flex-1 -tracking-[0.005em]">
          {title}
        </h3>
        <div className="flex items-center justify-between pt-3 gap-2.5 border-t border-[var(--border)]">
          <div className="flex gap-1">
            {trend.sources.map((s) => (
              <SourcePill key={s} src={s} />
            ))}
          </div>
          <ChevronRight
            size={14}
            className="text-[var(--text-3)] group-hover:text-[var(--red)] group-hover:translate-x-0.5 transition-transform"
          />
        </div>
      </div>
    </button>
  );
}
