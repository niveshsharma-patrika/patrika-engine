"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  ChevronRight,
  Newspaper,
  Zap,
  TrendingUp,
  Activity,
  Eye,
  Rss,
  Hash,
  type LucideIcon,
} from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { SECTION_COLORS, type SectionKey, type Trend } from "@/lib/data/trends";
import { TrustPips, freshness } from "@/components/trend-card";
import { TrendDrawer } from "@/components/trend-drawer";
import { SkeletonCard } from "@/components/skeletons";

// ─── Editorial feeds (the board columns) ──────────────────────
type BucketKey = "breaking" | "trending" | "developing" | "watching" | "newswire" | "social";

const BUCKETS: Array<{
  key: BucketKey;
  label_en: string;
  label_hi: string;
  hint: string;
}> = [
  { key: "breaking",   label_en: "Breaking",   label_hi: "तत्काल",   hint: "Major story · covered in the last 30 min" },
  { key: "trending",   label_en: "Trending",   label_hi: "ट्रेंडिंग", hint: "Major story · last covered 30 min – 4 h ago" },
  { key: "developing", label_en: "Developing", label_hi: "जारी",     hint: "Major story · last covered 4 – 12 h ago" },
  { key: "watching",   label_en: "Watching",   label_hi: "नज़र में",  hint: "2 sources · not yet at the 3-outlet bar" },
  { key: "newswire",   label_en: "Newswire",   label_hi: "न्यूज़वायर", hint: "Single-source · fresh wire copy, not yet corroborated" },
  { key: "social",     label_en: "Social",     label_hi: "सोशल",     hint: "Stories carried on X / social sources" },
];

// Per-tab accent colour + icon.
const TAB_ACCENT: Record<BucketKey, string> = {
  breaking: "var(--red)",
  trending: "var(--blue)",
  developing: "var(--green)",
  watching: "var(--amber)",
  newswire: "#0d9488",
  social: "var(--purple)",
};

const TAB_ICON: Record<BucketKey, LucideIcon> = {
  breaking: Zap,
  trending: TrendingUp,
  developing: Activity,
  watching: Eye,
  newswire: Rss,
  social: Hash,
};

// ─── Category filters ─────────────────────────────────────────
// Only the sections the clusterer actually produces (see sectionForCategory
// in lib/clustering/lexical.ts) — plus "All".
const CATEGORIES: Array<{ key: SectionKey | "all"; en: string; hi: string }> = [
  { key: "all",      en: "All",           hi: "सभी" },
  { key: "national", en: "National",      hi: "राष्ट्रीय" },
  { key: "world",    en: "World",         hi: "दुनिया" },
  { key: "politics", en: "Politics",      hi: "राजनीति" },
  { key: "business", en: "Business",      hi: "बिज़नेस" },
  { key: "sports",   en: "Sports",        hi: "खेल" },
  { key: "enter",    en: "Entertainment", hi: "मनोरंजन" },
  { key: "tech",     en: "Tech",          hi: "टेक" },
];

// ─── Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const { t, lang } = useLang();
  const [filter, setFilter] = useState<SectionKey | "all">("all");
  const [tab, setTab] = useState<BucketKey>("breaking");
  const [openTrend, setOpenTrend] = useState<Trend | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTrend, setEditorTrend] = useState<Trend | null>(null);
  const [editorTitle, setEditorTitle] = useState("");
  const [buckets, setBuckets] = useState<Record<BucketKey, Trend[]>>({
    breaking: [],
    trending: [],
    developing: [],
    watching: [],
    newswire: [],
    social: [],
  });
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  // Fetch all feeds in parallel, refresh every 60s.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const keys: BucketKey[] = ["breaking", "trending", "developing", "watching", "newswire", "social"];
        const results = await Promise.all(
          keys.map((k) =>
            fetch(`/api/trends?window=${k}`, { cache: "no-store" })
              .then((r) => r.json())
              .then((d): Trend[] =>
                Array.isArray(d.trends) ? (d.trends as Trend[]) : []
              )
              .catch((): Trend[] => [])
          )
        );
        if (cancelled) return;
        setBuckets({
          breaking: results[0],
          trending: results[1],
          developing: results[2],
          watching: results[3],
          newswire: results[4],
          social: results[5],
        });
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const [editorMode, setEditorMode] = useState<"factual" | "angle" | "blank">("blank");

  function openEditor(trend: Trend | null, mode: "factual" | "angle" | "blank" = "blank") {
    setEditorTrend(trend);
    setEditorTitle(trend?.title ?? "");
    setEditorMode(mode);
    setEditorOpen(true);
    setOpenTrend(null);
  }

  // One section (tab) at a time. Category chips filter WITHIN the active tab.
  const tabItems = buckets[tab] ?? [];
  const catCountInTab = (key: SectionKey | "all") =>
    key === "all" ? tabItems.length : tabItems.filter((tr) => tr.section === key).length;
  const visibleItems =
    filter === "all" ? tabItems : tabItems.filter((tr) => tr.section === filter);
  const activeBucket = BUCKETS.find((b) => b.key === tab) ?? BUCKETS[0];

  // The board — one column per feed, each scrolls independently.
  return (
    <>
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--text)]">
        <span className="text-[14px] font-medium">{t("trendingNow")}</span>
        <span className="font-mono text-xs text-[var(--text-3)]">
          {loadState === "loading"
            ? t("loading")
            : loadState === "error"
            ? "—"
            : t("live")}
          {" · "}
          <b className="text-[var(--text)] font-medium">
            {visibleItems.length} {t("topics")}
          </b>
        </span>
      </div>

      {/* Section tabs — big, icon-led; each shows ALL stories in that feed */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {BUCKETS.map((b) => {
          const active = tab === b.key;
          const accent = TAB_ACCENT[b.key];
          const n = (buckets[b.key] ?? []).length;
          const label = lang === "hi" ? b.label_hi : b.label_en;
          const Icon = TAB_ICON[b.key];
          return (
            <button
              key={b.key}
              onClick={() => setTab(b.key)}
              aria-pressed={active}
              className={`group flex items-center gap-2 pl-3 pr-3.5 py-2.5 rounded-xl border text-[14.5px] font-semibold transition-all ${
                active
                  ? "text-white shadow-[0_5px_16px_rgba(0,0,0,0.13)]"
                  : "bg-white border-[var(--border)] text-[var(--text-2)] hover:border-[var(--text-3)] hover:text-[var(--text)] hover:-translate-y-0.5 hover:shadow-sm"
              }`}
              style={active ? { background: accent, borderColor: accent } : undefined}
            >
              <span
                className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors"
                style={{
                  background: active ? "rgba(255,255,255,0.2)" : `color-mix(in srgb, ${accent} 13%, white)`,
                }}
              >
                <Icon size={16} strokeWidth={2.5} style={{ color: active ? "white" : accent }} />
              </span>
              {label}
              <span
                className={`font-mono text-[11px] leading-none px-1.5 py-1 rounded-md ${
                  active ? "bg-white/20 text-white" : "bg-[var(--surface-2)] text-[var(--text-3)]"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active section hint */}
      <p className="text-[12.5px] text-[var(--text-3)] mb-3 leading-snug">{activeBucket.hint}</p>

      {/* Category filters — scoped to the active tab */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {CATEGORIES.map((c) => {
          const active = filter === c.key;
          const n = catCountInTab(c.key);
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-[var(--text)] text-white border-[var(--text)]"
                  : "bg-white text-[var(--text-2)] border-[var(--border)] hover:border-[var(--text-2)] hover:text-[var(--text)]"
              }`}
            >
              {c.key !== "all" && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: SECTION_COLORS[c.key as SectionKey] }}
                />
              )}
              {lang === "hi" ? c.hi : c.en}
              <span
                className={`font-mono text-[10.5px] ${
                  active ? "text-white/70" : "text-[var(--text-3)]"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* All stories in the active section */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 items-start">
        {visibleItems.length > 0 ? (
          visibleItems.map((tr) => (
            <ColumnCard key={`${tab}-${tr.id}`} trend={tr} onClick={() => setOpenTrend(tr)} />
          ))
        ) : loadState === "loading" ? (
          Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <div className="col-span-full text-center text-[13px] text-[var(--text-3)] py-20 px-3 leading-snug">
            {tab === "social"
              ? lang === "hi"
                ? "अभी कोई सोशल स्रोत कनेक्ट नहीं है"
                : "No social source connected yet"
              : filter !== "all"
              ? lang === "hi"
                ? "इस श्रेणी में कोई कहानी नहीं"
                : "No stories in this category"
              : lang === "hi"
              ? "इस सेक्शन में अभी कोई कहानी नहीं"
              : "No stories in this section right now"}
          </div>
        )}
      </div>


      <button
        onClick={() => openEditor(null)}
        className="fixed bottom-7 right-7 bg-[var(--red)] hover:bg-[var(--red-hover)] text-white px-5 py-3.5 rounded-full text-[14px] font-medium flex items-center gap-2.5 z-30 transition-all hover:-translate-y-0.5"
        style={{ boxShadow: "0 4px 12px rgba(217, 48, 37, 0.3)" }}
      >
        <Plus size={16} />
        {t("writeOnTopic")}
        <kbd className="font-mono text-[11px] px-1.5 py-0.5 bg-white/20 rounded">⌘N</kbd>
      </button>

      {openTrend && (
        <TrendDrawer
          trend={openTrend}
          onClose={() => setOpenTrend(null)}
          onGenerate={(mode) => openEditor(openTrend, mode)}
        />
      )}

      {editorOpen && (
        <Editor
          trend={editorTrend}
          mode={editorMode}
          title={editorTitle}
          setTitle={setEditorTitle}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  );
}

// ─── Column card — image-forward tile for the feed columns ───
function ColumnCard({
  trend,
  onClick,
}: {
  trend: Trend;
  onClick: () => void;
}) {
  const { lang } = useLang();
  const title = lang === "hi" && trend.title_hi ? trend.title_hi : trend.title;
  const tag = lang === "hi" && trend.desk_hi ? trend.desk_hi : trend.tag;
  const lastSeen = freshness(trend.lastSeenMinAgo, lang);
  const moreLabel = lang === "hi" ? "और देखें" : "More";
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      className="group relative flex flex-col bg-white border border-[var(--border)] rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)] hover:border-[var(--border-2)] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]"
    >
      <CardHero src={trend.image} section={trend.section} count={trend.signalCount} />

      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: SECTION_COLORS[trend.section] }}
            />
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)] font-medium truncate">
              {tag}
            </span>
          </span>
          <span className="font-mono text-[10.5px] text-[var(--text-3)] whitespace-nowrap">
            {lastSeen}
          </span>
        </div>

        <h3 className="text-[14px] font-medium leading-snug -tracking-[0.005em] line-clamp-4">
          {title}
        </h3>

        <div className="flex items-center justify-between pt-2 mt-auto border-t border-[var(--border)] gap-2">
          <TrustPips score={trend.trust} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="flex items-center gap-0.5 text-[11px] font-medium text-[var(--text-2)] hover:text-[var(--red)] px-1.5 py-0.5 rounded hover:bg-[var(--red-soft)] transition-colors"
          >
            {moreLabel}
            <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Image-forward hero — a 4:3 image from one of the cluster's articles with
 * the source-count chip overlaid. Falls back to a tinted placeholder when
 * there's no image (or it fails to load). */
function CardHero({
  src,
  section,
  count,
}: {
  src?: string;
  section: SectionKey;
  count: number;
}) {
  const [ok, setOk] = useState(true);
  const showImg = src && ok;
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[var(--surface-2)]">
      {showImg ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setOk(false)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/35 to-transparent pointer-events-none" />
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <Newspaper size={26} className="opacity-25" style={{ color: SECTION_COLORS[section] }} />
        </div>
      )}
      <span className="absolute top-2 right-2 font-mono text-[10px] font-medium text-white bg-black/55 backdrop-blur-sm rounded-full px-2 py-0.5">
        {count} {count === 1 ? "src" : "srcs"}
      </span>
    </div>
  );
}

// ─── Editor ───────────────────────────────────────────────────
function Editor({
  trend, mode, title, setTitle, onClose,
}: {
  trend: Trend | null;
  mode: "factual" | "angle" | "blank";
  title: string;
  setTitle: (v: string) => void;
  onClose: () => void;
}) {
  const { t, lang } = useLang();
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  // Auto-generate immediately if opened with a mode from the drawer
  useEffect(() => {
    if (trend && (mode === "factual" || mode === "angle")) {
      handleGenerate(mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate(activeMode: "factual" | "angle" = "factual") {
    setGenerating(true);
    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trendId: trend?.id ?? null,
          mode: activeMode,
          lang,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.title) setTitle(json.title);
        if (json.body) setBody(json.body);
      } else {
        const err = await res.json().catch(() => ({}));
        setBody(`[Generation failed: ${err.error ?? res.status}]`);
      }
    } catch (err) {
      setBody(`[Network error: ${err instanceof Error ? err.message : "unknown"}]`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--bg)] flex flex-col">
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <button
          onClick={onClose}
          className="justify-self-start text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] text-[13px] px-3 py-2 rounded flex items-center gap-2"
        >
          ← {t("back")}
        </button>
        <div className="text-center">
          <div className="text-sm font-medium">{t("editorTitle")}</div>
          <div className="text-[11px] text-[var(--text-3)] font-mono mt-0.5">
            {trend ? `from trend #${trend.id}` : "New draft"}
          </div>
        </div>
        <div className="justify-self-end flex gap-2">
          <button className="bg-white border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] text-[13px] px-4 py-2 rounded font-medium">
            {t("saveDraft")}
          </button>
          <button className="bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[13px] px-4 py-2 rounded font-medium">
            {t("submitReview")}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-[1fr_340px] gap-6 max-w-[1320px] mx-auto">
          <div className="bg-white border border-[var(--border)] rounded-lg p-7">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article headline..."
              className="w-full text-2xl font-medium outline-none mb-3 placeholder:text-[var(--text-3)] placeholder:font-normal"
            />
            <div className="pb-4 border-b border-[var(--border)] mb-4 flex gap-2 flex-wrap">
              {["Desk", "600 words", "Editorial", "English"].map((label) => (
                <select key={label} className="bg-[var(--surface-2)] border border-[var(--border)] text-[13px] px-3 py-1.5 rounded outline-none focus:border-[var(--blue)] focus:bg-white">
                  <option>{label}</option>
                </select>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Start typing, or click Generate…"
              className="w-full min-h-[380px] outline-none text-[15px] leading-[1.7] resize-y"
            />
            <div className="flex gap-2 flex-wrap mt-4 pt-4 border-t border-[var(--border)]">
              <button
                onClick={() => handleGenerate("factual")}
                disabled={generating}
                className="bg-[var(--text)] hover:bg-black disabled:opacity-50 text-white text-xs font-medium px-3.5 py-2 rounded-full"
              >
                {generating ? `✨ ${t("generating")}` : `✨ ${lang === "hi" ? "तथ्यात्मक ड्राफ़्ट" : "Factual draft"}`}
              </button>
              <button
                onClick={() => handleGenerate("angle")}
                disabled={generating}
                className="bg-[var(--red)] hover:bg-[var(--red-hover)] disabled:opacity-50 text-white text-xs font-medium px-3.5 py-2 rounded-full"
              >
                {generating ? `✨ ${t("generating")}` : `✨ ${lang === "hi" ? "सुझाव वाला ड्राफ़्ट" : "Suggested-angle draft"}`}
              </button>
              {["Regenerate", "Expand", "Tighten", "Quotes"].map((l) => (
                <button key={l} className="bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--red-soft)] hover:text-[var(--red)] text-xs font-medium text-[var(--text-2)] px-3.5 py-2 rounded-full">
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-white border border-[var(--border)] rounded-lg p-4.5">
              <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium mb-3">{t("topicContext")}</h4>
              {trend ? (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium mb-1.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: SECTION_COLORS[trend.section] }} />
                    {trend.tag}
                  </div>
                  <div className="font-mono text-sm text-[var(--red)] font-medium pb-3 mb-3 border-b border-[var(--border)]">
                    ↑ {trend.velocityPct}% · {freshness(trend.lastSeenMinAgo, lang)}
                  </div>
                  <div>
                    <strong className="text-[10px] uppercase tracking-wider text-[var(--text-3)] font-medium block mb-1.5">Suggested angle</strong>
                    <div className="bg-[var(--red-soft)] p-2.5 rounded text-[12.5px] leading-relaxed">
                      {trend.suggestedAngle}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-[13px] text-[var(--text-3)] leading-relaxed">{t("noTrendSelected")}</div>
              )}
            </div>

            <div className="bg-white border border-[var(--border)] rounded-lg p-4.5">
              <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium mb-3">{t("stats")}</h4>
              <div className="flex justify-between text-xs text-[var(--text-2)] py-1">
                <span>{t("words")}</span>
                <b className="text-[var(--text)] font-medium font-mono">{words} / 600</b>
              </div>
              <div className="flex justify-between text-xs text-[var(--text-2)] py-1">
                <span>{t("readingTime")}</span>
                <b className="text-[var(--text)] font-medium font-mono">
                  {words > 0 ? Math.max(1, Math.round(words / 200)) + " min" : "—"}
                </b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
