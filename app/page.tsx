"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
  Loader2,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  Download,
  type LucideIcon,
} from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { SECTION_COLORS, type SectionKey, type StoryAngle, type Trend } from "@/lib/data/trends";
import { TrustPips, freshness } from "@/components/trend-card";
import { TrendDrawer } from "@/components/trend-drawer";
import { SkeletonCard } from "@/components/skeletons";

// ─── Editorial feeds (the board columns) ──────────────────────
// Injected into every generated widget so the sandboxed iframe can report its
// content height back to the dashboard (which then auto-sizes the iframe).
const WIDGET_HEIGHT_REPORTER = `<script>(function(){function p(){try{parent.postMessage({__patrikaWidgetHeight:Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)},'*')}catch(e){}}addEventListener('load',p);addEventListener('resize',p);setTimeout(p,150);setTimeout(p,600);setTimeout(p,1500);try{new ResizeObserver(p).observe(document.documentElement)}catch(e){}})();</script>`;

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
  const router = useRouter();
  const [filter, setFilter] = useState<SectionKey | "all">("all");
  const [tab, setTab] = useState<BucketKey>("breaking");
  const [openTrend, setOpenTrend] = useState<Trend | null>(null);
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

  // Generation now lives on its own page. Stash the trend (if any) so /generate
  // can import its context, then navigate there.
  function openEditor(trend: Trend | null) {
    try {
      if (trend) sessionStorage.setItem("patrika.generateTrend", JSON.stringify(trend));
      else sessionStorage.removeItem("patrika.generateTrend");
    } catch {
      /* sessionStorage unavailable — the page just opens blank */
    }
    setOpenTrend(null);
    router.push("/generate");
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
          onGenerate={() => openEditor(openTrend)}
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

// ─── Story-generation page (the "Content Generator") ──────────

const TONES = ["Neutral", "Formal", "Conversational", "Authoritative", "Empathetic", "Punchy"];
const VOICES = ["Brand-aligned", "Neutral", "First-person", "Investigative"];
const HEADLINE_TYPES = ["Factual", "Emotional", "Question", "How-to", "Number/List", "Punchy"];
const LEAD_STYLES = ["Summary", "Context", "Anecdote", "Question", "Quote"];
const TRENDING_OPTS = ["Low", "Medium", "High"];
const AUDIENCE_OPTS = ["Niche", "Broad", "General"];
const URGENCY_OPTS = ["Breaking", "Ongoing", "Evergreen"];
const PUBLICATION_OPTS = ["Patrika", "New York Times", "Reuters", "Al Jazeera", "BBC", "Bloomberg"];
// Writers shown depend on the selected publication. Keys MUST match WRITER_DESC
// in app/api/drafts/generate/route.ts so the prompt picks up each voice.
const WRITERS_BY_PUB: Record<string, string[]> = {
  Patrika: ["Senior Reporter", "Beat Correspondent", "Data Journalist", "Columnist", "Features Writer"],
  "New York Times": ["Thomas Friedman", "Maureen Dowd", "Ross Douthat", "David Brooks", "NYT National Correspondent"],
  Reuters: ["Reuters Markets Correspondent", "Reuters World Correspondent", "Reuters Breaking Desk"],
  "Al Jazeera": ["Marwan Bishara", "Andrew Mitrovica", "AJ Field Correspondent"],
  BBC: ["Lyse Doucet", "Jeremy Bowen", "Faisal Islam", "BBC News Correspondent"],
  Bloomberg: ["Matt Levine", "John Authers", "Tyler Cowen", "Bloomberg Markets Reporter"],
};
const READABILITY_OPTS = ["Easy", "Moderate", "Expert"];

function EnhField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="mb-3.5">
      <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)] cursor-pointer"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function EnhGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-[12px] font-semibold text-[var(--text)] mb-2.5">{title}</h4>
      {children}
    </div>
  );
}

export function Editor({ trend, title, setTitle, onClose, asPage = false }: {
  trend: Trend | null;
  title: string;
  setTitle: (v: string) => void;
  onClose: () => void;
  // asPage: render in-flow inside the shell (the /generate route) instead of as
  // a fixed full-screen overlay.
  asPage?: boolean;
}) {
  const { t, lang } = useLang();
  const [body, setBody] = useState("");
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  // AI Enhancement controls
  const [tone, setTone] = useState("Neutral");
  const [readability, setReadability] = useState(0); // 0 Easy · 1 Moderate · 2 Expert
  const [voice, setVoice] = useState("Brand-aligned");
  const [headlineType, setHeadlineType] = useState("Emotional");
  const [leadStyle, setLeadStyle] = useState("Context");
  const [trendingScore, setTrendingScore] = useState("Medium");
  const [audienceFit, setAudienceFit] = useState("Broad");
  const [urgency, setUrgency] = useState("Ongoing");
  const [publication, setPublication] = useState("Patrika");
  const [writer, setWriter] = useState("Senior Reporter");
  // Switching publication swaps the writer list; keep the writer valid.
  function handlePublicationChange(pub: string) {
    setPublication(pub);
    const writers = WRITERS_BY_PUB[pub] ?? [];
    if (writers.length && !writers.includes(writer)) setWriter(writers[0]);
  }
  const [numberOfTitles, setNumberOfTitles] = useState(5);
  const [wordCount, setWordCount] = useState(800);

  // Output language for the generated story (default Hindi — Patrika's main language)
  const [genLang, setGenLang] = useState<"hi" | "en">("hi");

  // Draft persistence
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "submitting" | "submitted" | "error"
  >("idle");

  // Story angle (moved here from the drawer)
  const [angles, setAngles] = useState<StoryAngle[] | undefined>(trend?.angles);
  const [selectedAngle, setSelectedAngle] = useState<StoryAngle | null>(null);
  const [loadingAngles, setLoadingAngles] = useState(false);

  // Interactive widget
  const [widgetHtml, setWidgetHtml] = useState<string | null>(null);
  const [widgetType, setWidgetType] = useState<string>("");
  const [loadingWidget, setLoadingWidget] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  // Auto-size the widget iframe to its content (widgets post their height).
  const [widgetHeight, setWidgetHeight] = useState(460);
  // Article hero image (AI-generated, held as a data URL).
  const [articleImage, setArticleImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const data = e.data as Record<string, unknown> | null;
      const h = data && typeof data === "object" ? data.__patrikaWidgetHeight : null;
      if (typeof h === "number" && h > 80) {
        setWidgetHeight(Math.min(Math.ceil(h) + 4, 1600));
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const hasGenerated = body.trim().length > 0 || titleOptions.length > 0;
  // No auto-generate — the page opens empty so the editor can set up the AI
  // Enhancement controls (and optionally an angle) before generating.

  async function generateAngles() {
    if (!trend?.uid) return;
    setLoadingAngles(true);
    try {
      const res = await fetch("/api/angles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trendId: trend.uid, lang: genLang, regenerate: Boolean(angles?.length) }),
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.angles)) setAngles(json.angles as StoryAngle[]);
    } catch {
      /* ignore */
    } finally {
      setLoadingAngles(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trendId: trend?.uid ?? trend?.id ?? null,
          mode: selectedAngle ? "angle" : "factual",
          lang: genLang,
          angle: selectedAngle ?? undefined,
          params: {
            tone,
            readability: READABILITY_OPTS[readability],
            voice,
            headlineType,
            leadStyle,
            audienceFit,
            urgency,
            trendingScore,
            publication,
            writer,
            numberOfTitles,
            wordCount,
          },
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const opts: string[] = Array.isArray(json.titles)
          ? json.titles
          : json.title
          ? [json.title]
          : [];
        setTitleOptions(opts);
        if (opts.length > 0) setTitle(opts[0]);
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

  async function handleSave(status: "in_progress" | "awaiting_review") {
    if (!title.trim()) return;
    setSaveState(status === "in_progress" ? "saving" : "submitting");
    try {
      const res = await fetch("/api/drafts/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          trendId: trend?.uid ?? null,
          title,
          body,
          status,
          desk: trend?.desk ?? null,
          meta: {
            tone,
            readability: READABILITY_OPTS[readability],
            voice,
            headlineType,
            leadStyle,
            audienceFit,
            urgency,
            trendingScore,
            publication,
            writer,
            wordCount,
            angle: selectedAngle ?? null,
            image: articleImage,
            widgetHtml,
            widgetType,
          },
        }),
      });
      const json = await res.json();
      if (res.ok && json.id) {
        setDraftId(json.id);
        setSaveState(status === "in_progress" ? "saved" : "submitted");
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    } finally {
      setTimeout(() => setSaveState("idle"), 2500);
    }
  }

  async function genImage() {
    const t = title.trim();
    if (!t || loadingImage) return;
    setLoadingImage(true);
    setImageError(null);
    try {
      const res = await fetch("/api/drafts/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      const json = await res.json();
      if (res.ok && json.image) setArticleImage(json.image);
      else setImageError(json.error ?? `Failed (${res.status})`);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingImage(false);
    }
  }

  async function generateWidget() {
    if (!trend?.uid) return;
    setLoadingWidget(true);
    setWidgetError(null);
    setWidgetHeight(460);
    try {
      const res = await fetch("/api/interactive/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trendId: trend.uid, lang: genLang }),
      });
      const json = await res.json();
      if (res.ok && json.html) {
        setWidgetHtml(json.html);
        setWidgetType(json.widgetType ?? "");
      } else {
        setWidgetError(json.error ?? `Failed (${res.status})`);
      }
    } catch (e) {
      setWidgetError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingWidget(false);
    }
  }

  return (
    <div
      className={
        asPage
          ? // Fill the shell's main area (bleed its padding) and scroll columns internally.
            "-mt-7 -mx-7 -mb-20 h-[calc(100vh-96px)] bg-[var(--bg)] flex flex-col"
          : "fixed inset-0 z-[60] bg-[var(--bg)] flex flex-col"
      }
    >
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <button
          onClick={onClose}
          className="justify-self-start text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] text-[13px] px-3 py-2 rounded flex items-center gap-2"
        >
          ← {t("back")}
        </button>
        <div className="text-center">
          <div className="text-sm font-medium">
            {lang === "hi" ? "कंटेंट जेनरेटर" : "Content Generator"}
          </div>
          <div className="text-[11px] text-[var(--text-3)] font-mono mt-0.5">
            {trend ? `#${trend.id}` : "New"}
          </div>
        </div>
        <div className="justify-self-end flex gap-2 items-center">
          <button
            onClick={() => handleSave("in_progress")}
            disabled={saveState === "saving" || saveState === "submitting" || !title.trim()}
            className="bg-white border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-50 text-[var(--text-2)] hover:text-[var(--text)] text-[13px] px-4 py-2 rounded font-medium min-w-[110px]"
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : t("saveDraft")}
          </button>
          <button
            onClick={() => handleSave("awaiting_review")}
            disabled={saveState === "saving" || saveState === "submitting" || !title.trim()}
            className="bg-[var(--red)] hover:bg-[var(--red-hover)] disabled:opacity-50 text-white text-[13px] px-4 py-2 rounded font-medium min-w-[130px]"
          >
            {saveState === "submitting"
              ? "Submitting…"
              : saveState === "submitted"
              ? "Submitted ✓"
              : t("submitReview")}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-[300px_1fr]">
        {/* LEFT — AI Enhancement sidebar */}
        <aside className="border-r border-[var(--border)] bg-[var(--surface)] overflow-y-auto p-5">
          <div className="flex items-center gap-2 mb-5">
            <span
              className="w-8 h-8 rounded-lg grid place-items-center"
              style={{ background: "color-mix(in srgb, var(--purple) 14%, white)" }}
            >
              <Sparkles size={16} className="text-[var(--purple)]" />
            </span>
            <h3 className="text-[15px] font-semibold">
              {lang === "hi" ? "AI एन्हांसमेंट" : "AI Enhancement"}
            </h3>
          </div>

          {/* Story language — default Hindi */}
          <div className="mb-5">
            <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1.5">
              {lang === "hi" ? "स्टोरी की भाषा" : "Story language"}
            </label>
            <div className="flex gap-1 p-1 bg-[var(--surface-2)] rounded-lg">
              {([["hi", "हिंदी"], ["en", "English"]] as const).map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => setGenLang(code)}
                  className={`flex-1 text-[12.5px] py-1.5 rounded-md font-medium transition-all ${
                    genLang === code
                      ? "bg-white text-[var(--text)] shadow-sm"
                      : "text-[var(--text-3)] hover:text-[var(--text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {trend?.uid && (
            <EnhGroup title={lang === "hi" ? "स्टोरी एंगल" : "Story Angle"}>
              {angles && angles.length > 0 ? (
                <div className="space-y-1.5">
                  {angles.map((a) => {
                    const sel = selectedAngle?.id === a.id;
                    return (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAngle(sel ? null : a)}
                        className={`w-full text-left p-2.5 rounded-lg border text-[12.5px] leading-snug transition-all ${
                          sel
                            ? "border-[var(--red)] bg-[var(--red-soft)] font-medium"
                            : "border-[var(--border)] bg-white hover:border-[var(--text-3)]"
                        }`}
                      >
                        <div className="text-[var(--text)]">{a.title}</div>
                        <span className="inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-3)]">
                          {a.format}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    onClick={generateAngles}
                    disabled={loadingAngles}
                    className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)] flex items-center gap-1 mt-1 disabled:opacity-50"
                  >
                    <RefreshCw size={11} className={loadingAngles ? "animate-spin" : ""} />
                    {lang === "hi" ? "नए एंगल" : "New angles"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={generateAngles}
                  disabled={loadingAngles}
                  className="w-full flex items-center justify-center gap-2 bg-white border border-[var(--border)] hover:border-[var(--purple)] text-[var(--text-2)] text-[12px] px-3 py-2 rounded-lg font-medium disabled:opacity-60"
                >
                  {loadingAngles ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  {loadingAngles
                    ? lang === "hi" ? "पढ़ रहे हैं…" : "Reading…"
                    : lang === "hi" ? "एंगल सुझाएँ" : "Suggest angles"}
                </button>
              )}
            </EnhGroup>
          )}

          <EnhGroup title={lang === "hi" ? "स्टोरी प्रासंगिकता" : "Story Relevance Filter"}>
            <EnhField label={lang === "hi" ? "ट्रेंडिंग स्कोर" : "Trending Score"} value={trendingScore} onChange={setTrendingScore} options={TRENDING_OPTS} />
            <EnhField label={lang === "hi" ? "ऑडियंस फिट" : "Audience Fit"} value={audienceFit} onChange={setAudienceFit} options={AUDIENCE_OPTS} />
            <EnhField label={lang === "hi" ? "तात्कालिकता" : "Urgency"} value={urgency} onChange={setUrgency} options={URGENCY_OPTS} />
          </EnhGroup>

          <EnhGroup title={lang === "hi" ? "टोन और स्टाइल" : "Tone and Style Filter"}>
            <EnhField label={lang === "hi" ? "टोन" : "Tone"} value={tone} onChange={setTone} options={TONES} />
            <div className="mb-3.5">
              <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                {lang === "hi" ? "पठनीयता" : "Readability"}
              </label>
              <input
                type="range"
                min={0}
                max={2}
                step={1}
                value={readability}
                onChange={(e) => setReadability(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: "var(--blue)" }}
              />
              <div className="flex justify-between text-[10px] text-[var(--text-3)] mt-0.5">
                <span>Easy</span>
                <span>Moderate</span>
                <span>Expert</span>
              </div>
            </div>
            <EnhField label={lang === "hi" ? "वॉइस" : "Voice"} value={voice} onChange={setVoice} options={VOICES} />
          </EnhGroup>

          <EnhGroup title={lang === "hi" ? "हेडलाइन और लीड" : "Headline and Lead Style Filter"}>
            <EnhField label={lang === "hi" ? "हेडलाइन प्रकार" : "Headline Type"} value={headlineType} onChange={setHeadlineType} options={HEADLINE_TYPES} />
            <EnhField label={lang === "hi" ? "लीड स्टाइल" : "Lead Style"} value={leadStyle} onChange={setLeadStyle} options={LEAD_STYLES} />
          </EnhGroup>

          <EnhGroup title={lang === "hi" ? "लेखन शैली प्रेरणा" : "Writing Style Inspiration Filter"}>
            <EnhField label={lang === "hi" ? "प्रकाशन" : "Publication"} value={publication} onChange={handlePublicationChange} options={PUBLICATION_OPTS} />
            <EnhField label={lang === "hi" ? "लेखक" : "Writer"} value={writer} onChange={setWriter} options={WRITERS_BY_PUB[publication] ?? []} />
            <div className="mb-3.5">
              <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                {lang === "hi" ? "शीर्षकों की संख्या" : "Number of Titles"}
              </label>
              <input
                type="number"
                min={1}
                max={8}
                value={numberOfTitles}
                onChange={(e) => setNumberOfTitles(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                className="w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]"
              />
            </div>
            <div className="mb-3.5">
              <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">
                {lang === "hi" ? "लक्ष्य शब्द संख्या" : "Target Word Count"}
              </label>
              <input
                type="number"
                min={100}
                max={2000}
                step={50}
                value={wordCount}
                onChange={(e) => setWordCount(Math.max(100, Math.min(2000, Number(e.target.value) || 100)))}
                className="w-full bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]"
              />
            </div>
          </EnhGroup>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 text-white text-[14px] px-4 py-3 rounded-lg font-medium disabled:opacity-60"
            style={{ background: "var(--purple)" }}
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {generating
              ? t("generating")
              : hasGenerated
              ? lang === "hi" ? "फिर से बनाएँ →" : "Regenerate →"
              : lang === "hi" ? "स्टोरी बनाएँ →" : "Generate story →"}
          </button>
        </aside>

        {/* MAIN — Write with AI */}
        <main className="overflow-y-auto p-8">
          <div className="max-w-[760px]">
            <h2 className="text-[20px] font-semibold flex items-center gap-2">
              {lang === "hi" ? "AI से लिखें" : "Write with AI"}
              <Sparkles size={17} className="text-[var(--purple)]" />
            </h2>
            <p className="text-[13px] text-[var(--text-3)] mb-5">
              {lang === "hi" ? "प्रॉम्प्ट. जेनरेट. प्रकाशन-तैयार." : "Prompt. Generate. Publish-ready."}
            </p>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lang === "hi" ? "शीर्षक…" : "Headline…"}
              className="w-full text-[24px] font-bold leading-tight outline-none mb-5 placeholder:text-[var(--text-3)] placeholder:font-normal"
            />

            {titleOptions.length > 0 && (
              <div className="mb-6">
                <h4 className="text-[14px] font-semibold mb-2.5">
                  {lang === "hi" ? "अनुशंसित शीर्षक" : "Recommended Titles"}
                </h4>
                <div className="space-y-2">
                  {titleOptions.map((opt, i) => {
                    const active = opt === title;
                    return (
                      <button
                        key={i}
                        onClick={() => setTitle(opt)}
                        className={`w-full flex items-start gap-2.5 text-left p-3.5 rounded-xl border transition-all ${
                          active ? "border-[var(--purple)]" : "border-[var(--border)] bg-white hover:border-[var(--text-3)]"
                        }`}
                        style={active ? { background: "color-mix(in srgb, var(--purple) 6%, white)" } : undefined}
                      >
                        <span
                          className="mt-0.5 w-4 h-4 rounded grid place-items-center shrink-0 border text-white text-[10px]"
                          style={
                            active
                              ? { background: "var(--purple)", borderColor: "var(--purple)" }
                              : { borderColor: "var(--border-2)" }
                          }
                        >
                          {active ? "✓" : ""}
                        </span>
                        <span className="text-[14px] leading-snug text-[var(--text)]">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-white border border-[var(--border)] rounded-xl p-6 relative">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={generating}
                placeholder={lang === "hi" ? "आपका लेख यहाँ बनेगा…" : "Your article will appear here…"}
                className={`w-full min-h-[420px] outline-none text-[15px] leading-[1.7] resize-y transition-opacity ${
                  generating ? "opacity-20" : ""
                }`}
              />
              {generating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center pointer-events-none">
                  <Loader2 className="animate-spin text-[var(--purple)]" size={30} />
                  <div className="text-[13.5px] text-[var(--text)] font-medium">
                    {lang === "hi" ? "आपका लेख लिखा जा रहा है…" : "Writing your article…"}
                  </div>
                  <div className="text-[11px] text-[var(--text-3)]">
                    {lang === "hi" ? "कुछ सेकंड…" : "A few seconds…"}
                  </div>
                </div>
              )}
              <div className="flex justify-between text-[11px] text-[var(--text-3)] mt-3 pt-3 border-t border-[var(--border)]">
                <span>
                  {words} {lang === "hi" ? "शब्द" : "words"} · ~{wordCount} {lang === "hi" ? "लक्ष्य" : "target"}
                </span>
                <span>{words > 0 ? `${Math.max(1, Math.round(words / 200))} min read` : ""}</span>
              </div>
            </div>

            {/* Article hero image — AI-generated from the headline */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[14px] font-semibold flex items-center gap-1.5">
                  <ImageIcon size={15} className="text-[var(--purple)]" />
                  {lang === "hi" ? "आर्टिकल इमेज" : "Article image"}
                </h4>
                <div className="flex items-center gap-2">
                  {articleImage && (
                    <a
                      href={articleImage}
                      download="patrika-article.png"
                      className="text-[12px] text-[var(--text-3)] hover:text-[var(--text)] flex items-center gap-1"
                    >
                      <Download size={13} /> {lang === "hi" ? "डाउनलोड" : "Download"}
                    </a>
                  )}
                  <button
                    onClick={genImage}
                    disabled={loadingImage || !title.trim()}
                    className="bg-[var(--purple)] text-white text-[12px] font-medium px-3 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {loadingImage ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {loadingImage
                      ? lang === "hi" ? "बना रहे हैं…" : "Generating…"
                      : articleImage
                      ? lang === "hi" ? "फिर से बनाएँ" : "Regenerate"
                      : lang === "hi" ? "इमेज बनाएँ" : "Generate image"}
                  </button>
                </div>
              </div>
              {imageError && <div className="text-[12px] text-[var(--red)] mb-2">{imageError}</div>}
              {articleImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={articleImage} alt="" className="w-full rounded-xl border border-[var(--border)]" />
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-[12px] text-[var(--text-3)]">
                  {lang === "hi"
                    ? "हेडलाइन से एक आर्टिकल इमेज बनाएँ (उसमें कोई टेक्स्ट नहीं होगा)।"
                    : "Generate an article image from the headline (no text baked in)."}
                </div>
              )}
            </div>

            {/* Interactive widget — AI picks the most engaging type for the story */}
            {trend?.uid && (
              <div className="mt-6">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <h4 className="text-[14px] font-semibold flex items-center gap-1.5">
                    <Sparkles size={15} className="text-[var(--purple)]" />
                    {lang === "hi" ? "इंटरैक्टिव विजेट" : "Interactive widget"}
                    {widgetType && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-3)] font-normal">
                        {widgetType}
                      </span>
                    )}
                  </h4>
                  <div className="flex items-center gap-3">
                    {widgetHtml && (
                      <button
                        onClick={() => navigator.clipboard?.writeText(widgetHtml)}
                        className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)]"
                      >
                        {lang === "hi" ? "HTML कॉपी करें" : "Copy HTML"}
                      </button>
                    )}
                    <button
                      onClick={generateWidget}
                      disabled={loadingWidget}
                      className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                      style={{ background: "var(--purple)" }}
                    >
                      {loadingWidget ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      {loadingWidget
                        ? lang === "hi" ? "बना रहे हैं…" : "Building…"
                        : widgetHtml
                        ? lang === "hi" ? "फिर से बनाएँ" : "Regenerate"
                        : lang === "hi" ? "विजेट बनाएँ" : "Generate widget"}
                    </button>
                  </div>
                </div>
                {widgetError && (
                  <div className="text-[12px] text-[var(--red)] mb-2 leading-snug">{widgetError}</div>
                )}
                {widgetHtml ? (
                  <iframe
                    title="Interactive widget"
                    srcDoc={widgetHtml + WIDGET_HEIGHT_REPORTER}
                    sandbox="allow-scripts"
                    style={{ height: widgetHeight }}
                    className="w-full rounded-xl border border-[var(--border)] bg-white transition-[height] duration-200"
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--border-2)] bg-[var(--surface-2)] py-12 text-center text-[13px] text-[var(--text-3)] leading-relaxed px-4">
                    {lang === "hi"
                      ? "स्टोरी के लिए एक छोटा इंटरैक्टिव विजेट बनाएँ — AI सबसे उपयुक्त प्रकार चुनेगा (स्लाइडर, टाइमलाइन, चार्ट…)।"
                      : "Build a small interactive widget for this story — AI picks the best-fit type (slider, timeline, chart…)."}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
