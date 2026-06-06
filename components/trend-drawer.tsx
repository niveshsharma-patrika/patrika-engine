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

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ExternalLink, ChevronDown, Sparkles, Loader2, RefreshCw } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { SECTION_COLORS, type Trend, type StoryAngle } from "@/lib/data/trends";
import { SourcePill, TrustPips, freshness } from "@/components/trend-card";

type ArticleSignal = NonNullable<Trend["topSignals"]>[number];

/** One article in the cluster, shown as a card. Links out to the source
 * when a URL is available; the thumbnail comes from that article. */
function ArticleCard({ sig }: { sig: ArticleSignal }) {
  const [imgOk, setImgOk] = useState(true);
  const inner = (
    <>
      {sig.image && imgOk && (
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[var(--surface-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sig.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-[var(--text-3)] truncate">
            {sig.author}
          </span>
          {sig.url && (
            <ExternalLink
              size={13}
              className="shrink-0 text-[var(--text-3)] group-hover:text-[var(--red)]"
            />
          )}
        </div>
        <div className="text-[13.5px] text-[var(--text)] leading-snug mt-0.5 line-clamp-3">
          {sig.text}
        </div>
        {sig.meta && (
          <div className="font-mono text-[11px] text-[var(--text-3)] mt-1">{sig.meta}</div>
        )}
      </div>
    </>
  );

  const cls =
    "flex gap-3 p-2.5 rounded-lg border border-[var(--border)] hover:border-[var(--text)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all group";

  return sig.url ? (
    <a href={sig.url} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export type GenerateMode = "factual" | "angle";

export function TrendDrawer({
  trend,
  onClose,
  onGenerate,
  readOnly = false,
}: {
  trend: Trend;
  onClose: () => void;
  onGenerate: (mode: GenerateMode, angle?: StoryAngle) => void;
  /** Hides the Generate buttons (used on /today digest page).
   *  Shows an "Open on dashboard" link instead for users who want to write up. */
  readOnly?: boolean;
}) {
  const { lang } = useLang();
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [angles, setAngles] = useState<StoryAngle[] | undefined>(trend.angles);
  const [selectedAngleId, setSelectedAngleId] = useState<string | null>(
    trend.angles?.[0]?.id ?? null
  );
  const [loadingAngles, setLoadingAngles] = useState(false);
  const [anglesError, setAnglesError] = useState<string | null>(null);

  async function generateAngles(regenerate: boolean) {
    if (!trend.uid) return;
    setLoadingAngles(true);
    setAnglesError(null);
    try {
      const res = await fetch("/api/angles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trendId: trend.uid, lang, regenerate }),
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.angles)) {
        setAngles(json.angles as StoryAngle[]);
        setSelectedAngleId((json.angles as StoryAngle[])[0]?.id ?? null);
      } else {
        setAnglesError(json.error ?? `Failed (${res.status})`);
      }
    } catch (e) {
      setAnglesError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingAngles(false);
    }
  }

  // Lazily load any SAVED angles when the drawer opens (no generation).
  useEffect(() => {
    const uid = trend.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/angles/generate?trendId=${encodeURIComponent(uid)}`
        );
        const json = await res.json();
        if (!cancelled && Array.isArray(json.angles) && json.angles.length > 0) {
          setAngles(json.angles as StoryAngle[]);
          setSelectedAngleId((json.angles as StoryAngle[])[0]?.id ?? null);
        }
      } catch {
        /* ignore — drawer just shows the Generate button */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trend.uid]);

  const title = lang === "hi" && trend.title_hi ? trend.title_hi : trend.title;
  const tag = lang === "hi" && trend.desk_hi ? trend.desk_hi : trend.tag;
  const angle =
    lang === "hi" && trend.suggestedAngle_hi
      ? trend.suggestedAngle_hi
      : trend.suggestedAngle;

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
              <button
                onClick={() => setCoverageOpen((v) => !v)}
                aria-expanded={coverageOpen}
                className="w-full flex items-center justify-between gap-2 text-left group"
              >
                <h5 className="text-xs uppercase tracking-wider text-[var(--text-3)] font-medium flex items-center gap-2">
                  {lang === "hi" ? "कवरेज" : "Coverage"}
                  <span className="font-mono text-[var(--text-3)] normal-case tracking-normal">
                    {trend.topSignals.length}
                  </span>
                </h5>
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)] group-hover:text-[var(--text)]">
                  {coverageOpen
                    ? lang === "hi" ? "छुपाएँ" : "Hide"
                    : lang === "hi" ? "सभी देखें" : "Show all"}
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${coverageOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </button>
              {coverageOpen && (
                <div className="space-y-2 mt-3">
                  {trend.topSignals.map((sig, i) => (
                    <ArticleCard key={i} sig={sig} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Angles — AI proposes 2-3 ways to approach the story (on demand) */}
          <div className="py-4 border-b border-[var(--border)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h5 className="text-xs uppercase tracking-wider text-[var(--text-3)] font-medium">
                {lang === "hi" ? "एंगल" : "Angles"}
              </h5>
              {angles && angles.length > 0 && trend.uid && !readOnly && (
                <button
                  onClick={() => generateAngles(true)}
                  disabled={loadingAngles}
                  className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)] flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw size={12} className={loadingAngles ? "animate-spin" : ""} />
                  {lang === "hi" ? "फिर से बनाएँ" : "Regenerate"}
                </button>
              )}
            </div>

            {angles && angles.length > 0 ? (
              <div className="space-y-2">
                {angles.map((a) => {
                  const sel = selectedAngleId === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAngleId(a.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        sel
                          ? "border-[var(--red)] bg-[var(--red-soft)] ring-1 ring-[var(--red)]"
                          : "border-[var(--border)] hover:border-[var(--text-3)] bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[13.5px] font-medium leading-snug text-[var(--text)]">
                          {a.title}
                        </div>
                        <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-3)]">
                          {a.format}
                        </span>
                      </div>
                      <div className="text-[12.5px] text-[var(--text-2)] leading-relaxed mt-1">
                        {a.summary}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {angle && (
                  <div className="text-[12.5px] text-[var(--text-2)] leading-relaxed bg-[var(--surface-2)] p-3 rounded-lg">
                    <span className="text-[var(--text-3)]">
                      {lang === "hi" ? "स्वतः सुझाव — " : "Auto hint — "}
                    </span>
                    {angle}
                  </div>
                )}
                {trend.uid && !readOnly ? (
                  <button
                    onClick={() => generateAngles(false)}
                    disabled={loadingAngles}
                    className="w-full flex items-center justify-center gap-2 bg-[var(--text)] hover:bg-black disabled:opacity-60 text-white text-[12.5px] px-3 py-2.5 rounded-lg font-medium"
                  >
                    {loadingAngles ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    {loadingAngles
                      ? lang === "hi"
                        ? "कवरेज पढ़ रहे हैं…"
                        : "Reading coverage…"
                      : lang === "hi"
                      ? "AI से एंगल बनाएँ"
                      : "Generate angles with AI"}
                  </button>
                ) : !trend.uid ? (
                  <div className="text-[12px] text-[var(--text-3)]">
                    {lang === "hi"
                      ? "एंगल बहु-स्रोत स्टोरी के लिए हैं।"
                      : "Angles need a multi-source story."}
                  </div>
                ) : null}
                {anglesError && (
                  <div className="text-[12px] text-[var(--red)] leading-snug">{anglesError}</div>
                )}
              </div>
            )}
          </div>

          {/* Generate draft */}
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
                <button
                  onClick={() => {
                    const a = angles?.find((x) => x.id === selectedAngleId);
                    if (a) onGenerate("angle", a);
                  }}
                  disabled={!selectedAngleId}
                  className="w-full bg-[var(--red)] hover:bg-[var(--red-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] px-3 py-3 rounded-lg font-medium leading-tight"
                >
                  {lang === "hi" ? "चयनित एंगल से ड्राफ़्ट बनाएँ" : "Generate suggested story draft"}
                  <span className="block text-[10px] font-normal text-white/70 mt-0.5">
                    {selectedAngleId
                      ? lang === "hi"
                        ? "चयनित एंगल के अनुसार"
                        : "Following the selected angle"
                      : lang === "hi"
                      ? "पहले ऊपर एक एंगल चुनें"
                      : "Select an angle above first"}
                  </span>
                </button>
                <button
                  onClick={() => onGenerate("factual")}
                  className="w-full bg-white border border-[var(--border)] hover:border-[var(--text)] text-[var(--text-2)] hover:text-[var(--text)] text-[12.5px] px-3 py-2.5 rounded-lg font-medium"
                >
                  {lang === "hi"
                    ? "या सीधा समाचार ड्राफ़्ट बनाएँ"
                    : "Or generate a straight news report"}
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
