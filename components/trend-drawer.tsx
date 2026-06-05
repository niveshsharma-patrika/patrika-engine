"use client";

/**
 * Trend drawer — slides in from the right when a trend card is clicked.
 * Shared between the live dashboard (/) and the daily digest (/today).
 *
 * The `onGenerate` callback is page-specific:
 *   - On / it opens the inline Editor modal
 *   - On /today it navigates to / with query params so the editor opens there
 *     (we don't render Editor on /today to keep that page focused on the digest)
 */

import Link from "next/link";
import { X, ExternalLink } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { SECTION_COLORS, type Trend } from "@/lib/data/trends";
import { SourcePill, TrustPips, freshness } from "@/components/trend-card";

export type GenerateMode = "factual" | "angle";

export function TrendDrawer({
  trend,
  onClose,
  onGenerate,
  readOnly = false,
}: {
  trend: Trend;
  onClose: () => void;
  onGenerate: (mode: GenerateMode) => void;
  /** Hides the Generate buttons (used on /today digest page).
   *  Shows an "Open on dashboard" link instead for users who want to write up. */
  readOnly?: boolean;
}) {
  const { t, lang } = useLang();
  const title = lang === "hi" && trend.title_hi ? trend.title_hi : trend.title;
  const tag = lang === "hi" && trend.desk_hi ? trend.desk_hi : trend.tag;
  const angle =
    lang === "hi" && trend.suggestedAngle_hi
      ? trend.suggestedAngle_hi
      : trend.suggestedAngle;
  const storyType =
    lang === "hi" && trend.storyType_hi ? trend.storyType_hi : trend.storyType;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute top-0 right-0 bottom-0 w-[560px] max-w-[92vw] bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.18)] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 grid place-items-center text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] rounded-full z-10"
        >
          <X size={16} />
        </button>
        <div className="p-8 overflow-y-auto flex-1">
          <div className="text-[12px] uppercase tracking-wider text-[var(--text-3)] font-medium mb-2.5 flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: SECTION_COLORS[trend.section] }}
            />
            {tag}
          </div>
          <h2 className="text-[22px] font-medium leading-tight mb-3.5">{title}</h2>
          <div className="flex items-baseline gap-3 pb-4 border-b border-[var(--border)]">
            <span className="font-mono font-medium text-2xl text-[var(--red)]">
              {trend.signalCount} {trend.signalCount === 1 ? "source" : "sources"}
            </span>
            <span className="font-mono text-xs text-[var(--text-3)]">
              {freshness(trend.lastSeenMinAgo, lang)}
            </span>
          </div>

          <div className="py-4 border-b border-[var(--border)]">
            <h5 className="text-xs uppercase tracking-wider text-[var(--text-3)] font-medium mb-3">
              Sources
            </h5>
            <div className="flex gap-2 flex-wrap items-center">
              {trend.sources.map((s) => (
                <SourcePill key={s} src={s} />
              ))}
              <span className="text-xs text-[var(--text-2)] ml-2 flex items-center gap-2">
                Trust <TrustPips score={trend.trust} />
              </span>
            </div>
          </div>

          {trend.topSignals && trend.topSignals.length > 0 && (
            <div className="py-4 border-b border-[var(--border)]">
              <h5 className="text-xs uppercase tracking-wider text-[var(--text-3)] font-medium mb-3">
                Top signals
              </h5>
              <div className="space-y-2">
                {trend.topSignals.map((sig, i) => (
                  <div
                    key={i}
                    className="text-sm pb-2 border-b border-[var(--border)] last:border-0"
                  >
                    <div className="font-mono text-[11px] text-[var(--text-3)] mb-1">
                      {sig.author}
                    </div>
                    <div className="text-[var(--text)]">{sig.text}</div>
                    {sig.meta && (
                      <div className="font-mono text-[11px] text-[var(--text-3)] mt-1">
                        {sig.meta}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="py-4 border-b border-[var(--border)]">
            <h5 className="text-xs uppercase tracking-wider text-[var(--text-3)] font-medium mb-3">
              {lang === "hi" ? "सुझाया गया कोण" : "Suggested angle"}
              {storyType && (
                <span className="ml-3 inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--text)] text-white tracking-normal normal-case">
                  {lang === "hi" ? "फ़ॉर्मेट" : "FORMAT"}: {storyType}
                </span>
              )}
            </h5>
            <div className="bg-[var(--red-soft)] p-3.5 rounded text-[13px] leading-relaxed">
              {angle}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--border)] space-y-2">
            {readOnly ? (
              <Link
                href="/"
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 bg-[var(--text)] hover:bg-black text-white text-[12.5px] px-3 py-3 rounded font-medium leading-tight"
              >
                <ExternalLink size={14} />
                {lang === "hi"
                  ? "ड्राफ़्ट बनाने के लिए डैशबोर्ड खोलें"
                  : "Open on dashboard to generate"}
              </Link>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onGenerate("factual")}
                    className="bg-[var(--text)] hover:bg-black text-white text-[12.5px] px-3 py-3 rounded font-medium leading-tight text-left"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-white/60 mb-1">
                      {lang === "hi" ? "विकल्प 1" : "Option 1"}
                    </div>
                    {lang === "hi" ? "स्टोरी को कवर करने का ड्राफ़्ट" : "Generate Draft"}
                    <div className="text-[10px] font-normal text-white/70 mt-1 leading-snug">
                      {lang === "hi" ? "जैसा रिपोर्ट हुआ है" : "Straight news report"}
                    </div>
                  </button>
                  <button
                    onClick={() => onGenerate("angle")}
                    className="bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[12.5px] px-3 py-3 rounded font-medium leading-tight text-left"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-white/70 mb-1">
                      {lang === "hi" ? "विकल्प 2" : "Option 2"}
                    </div>
                    {lang === "hi"
                      ? "सुझाव वाले कोण का ड्राफ़्ट"
                      : "Generate Suggested Story Draft"}
                    <div className="text-[10px] font-normal text-white/80 mt-1 leading-snug">
                      {lang === "hi" ? "सुझाए गए कोण के अनुसार" : "Following the suggested angle"}
                    </div>
                  </button>
                </div>
                <button className="w-full bg-white border border-[var(--border)] hover:border-[var(--text)] text-[var(--text-2)] hover:text-[var(--text)] text-[12px] px-3 py-2 rounded font-medium">
                  {t("snooze")}
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
