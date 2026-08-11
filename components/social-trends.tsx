"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Sparkles, Copy, Check, AtSign, Newspaper, Bookmark,
  BookmarkCheck, Trash2, Camera, ThumbsUp, Play, Clock, Languages, ShieldAlert,
  Lightbulb, Calendar,
} from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import type { Metrics } from "@/lib/social/scorecard";
import type { EngagementIdea, EngagementMetrics, FormatKey } from "@/lib/social/engagement";

type NewsItem = {
  id: string;
  title: string;
  title_hi: string | null;
  desk: string | null;
  publisher_count: number | null;
  last_updated: string | null;
};

type Pack = {
  angle: string; x: string; instagram: string; facebook: string;
  youtube_title: string; hashtags: string[]; image_concept: string; caution: string;
};
type Corro = { title: string; source: string; url: string; date: string };
type AnyMetrics = Metrics | EngagementMetrics;

type SavedPost = {
  id: string;
  kind: "news" | "engagement";
  title: string;
  lang: string;
  pack: Pack;
  metrics: AnyMetrics | null;
  corroboration: Corro[] | null;
  has_image: boolean;
  created_at: string;
  created_by_name: string | null;
};

type Tab = "news" | "engagement" | "saved";

// Client-side format labels (the FORMATS value lives in a server module).
const FMT: Record<FormatKey, { en: string; hi: string }> = {
  poll: { en: "Poll", hi: "पोल" },
  this_or_that: { en: "This or That", hi: "यह या वह" },
  debate_prompt: { en: "Debate", hi: "चर्चा" },
  ask_readers: { en: "Ask Readers", hi: "पाठकों से पूछें" },
  local_lens: { en: "Local Lens", hi: "अपने शहर की बात" },
  dialect_prompt: { en: "Dialect", hi: "बोली की बात" },
  prediction: { en: "Prediction", hi: "अनुमान" },
  fact_check: { en: "Fact Check", hi: "सच या झूठ" },
  quiz: { en: "Quiz", hi: "प्रश्नोत्तरी" },
  caption_this: { en: "Caption This", hi: "कैप्शन दीजिए" },
  good_news: { en: "Good News", hi: "अच्छी खबर" },
  this_day_in_history: { en: "This Day", hi: "इतिहास में आज" },
};

function ago(iso: string | null, lang: string): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

export function SocialTrends() {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [tab, setTab] = useState<Tab>("news");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [ideas, setIdeas] = useState<EngagementIdea[]>([]);
  const [saved, setSaved] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [packId, setPackId] = useState<string | null>(null); // which item `pack` belongs to
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [corroboration, setCorroboration] = useState<Corro[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(async (which: Tab) => {
    if (which === "engagement") { setLoading(false); return; } // ideas are on-demand
    setLoading(true);
    try {
      if (which === "news") {
        const res = await fetch("/api/social/news");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed");
        setNews(json.trends ?? []);
      } else {
        const res = await fetch("/api/social/saved");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed");
        setSaved(json.posts ?? []);
      }
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(tab); }, [load, tab]);

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next); setOpenId(null); setPack(null); setPackId(null); setMetrics(null);
    setImage(null); setError(null); setSavedFlash(false);
  }

  async function genIdeas() {
    setIdeasBusy(true); setError(null); setOpenId(null);
    try {
      const res = await fetch("/api/social/engagement/ideas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "Failed");
      setIdeas(json.ideas ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate ideas"); }
    finally { setIdeasBusy(false); }
  }

  // Re-show a cached pack rather than re-running a (paid) generation.
  function toggle(id: string) {
    if (openId === id) { setOpenId(null); return; }
    if (packId === id && pack) { setOpenId(id); return; }
    regen(id);
  }
  function regen(id: string) {
    if (tab === "engagement") {
      const idea = ideas.find((i) => i.id === id);
      if (idea) generateFromIdea(idea);
    } else {
      generateNews(id);
    }
  }

  async function generateNews(id: string) {
    setGenBusy(id); setError(null); setSavedFlash(false);
    try {
      const res = await fetch(`/api/social/news/${id}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "Failed");
      setPack(json.pack); setPackId(id);
      setMetrics(json.metrics ?? null);
      setCorroboration(Array.isArray(json.corroboration) ? json.corroboration : []);
      setImage(null); setOpenId(id);
    } catch (e) { setError(e instanceof Error ? e.message : "Generation failed"); }
    finally { setGenBusy(null); }
  }

  async function generateFromIdea(idea: EngagementIdea) {
    setGenBusy(idea.id); setError(null); setSavedFlash(false);
    try {
      const res = await fetch("/api/social/engagement/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, lang }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "Failed");
      setPack(json.pack); setPackId(idea.id);
      setMetrics(null); setCorroboration([]); setImage(null); setOpenId(idea.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Generation failed"); }
    finally { setGenBusy(null); }
  }

  async function genImage(id: string) {
    if (!pack?.image_concept) return;
    setImgBusy(true); setError(null);
    try {
      const res = await fetch(`/api/social/trends/${id}/image`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept: pack.image_concept }),
      });
      const json = await res.json();
      if (!res.ok || !json.image) throw new Error(json.error ?? "Failed");
      setImage(json.image);
    } catch (e) { setError(e instanceof Error ? e.message : "Image generation failed"); }
    finally { setImgBusy(false); }
  }

  async function save(id: string) {
    if (!pack) return;
    let title = "";
    let kind: "news" | "engagement" = "news";
    let savedMetrics: AnyMetrics | null = null;
    let corr: Corro[] = [];
    if (tab === "engagement") {
      const idea = ideas.find((i) => i.id === id);
      kind = "engagement";
      title = idea ? (lang === "hi" ? idea.title.hi : idea.title.en) : "";
      savedMetrics = idea?.metrics ?? null;
    } else {
      kind = "news";
      const n = news.find((x) => x.id === id);
      title = (lang === "hi" && n?.title_hi ? n.title_hi : n?.title) ?? "";
      savedMetrics = metrics;
      corr = corroboration;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/social/saved", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, source_ref: id, title, lang, pack, metrics: savedMetrics, corroboration: corr, image }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "Failed");
      setSavedFlash(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  async function removeSaved(id: string) {
    setSaved((prev) => prev.filter((s) => s.id !== id));
    try { await fetch(`/api/social/saved/${id}`, { method: "DELETE" }); }
    catch { await load("saved"); }
  }

  function copy(key: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  const panelFor = (id: string) => {
    if (openId !== id || !pack) return null;
    const scorecard =
      tab === "engagement"
        ? (() => { const idea = ideas.find((i) => i.id === id); return idea ? <EngagementScorecard m={idea.metrics} t={t} /> : null; })()
        : metrics ? <Scorecard m={metrics} t={t} /> : null;
    return (
      <CreativePanel
        id={id} pack={pack} scorecard={scorecard} showCrossCheck={tab !== "engagement"}
        corroboration={corroboration} image={image} imgBusy={imgBusy} saving={saving} savedFlash={savedFlash}
        onImage={() => genImage(id)} onRegenerate={() => regen(id)} onSave={() => save(id)}
        copy={copy} copied={copied} t={t}
      />
    );
  };

  const genLabel = (id: string) =>
    genBusy === id ? t("Writing…", "लिख रहे…")
      : openId === id || packId === id ? t("View post", "पोस्ट देखें")
      : t("Create post", "पोस्ट बनाएँ");

  const TABS: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: "news", icon: <Newspaper size={13} />, label: t("News Trends", "न्यूज़ ट्रेंड") },
    { key: "engagement", icon: <Sparkles size={13} />, label: t("Engagement Posts", "एंगेजमेंट पोस्ट") },
    { key: "saved", icon: <Bookmark size={13} />, label: t("Saved", "सहेजे गए") },
  ];

  return (
    <>
      {/* Tab bar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-[12px] font-medium">
          {TABS.map((tb) => (
            <button key={tb.key} onClick={() => switchTab(tb.key)}
              className={`px-3 py-1.5 flex items-center gap-1.5 ${tab === tb.key ? "bg-[var(--purple)] text-white" : "text-[var(--text-2)] hover:bg-[var(--surface-2)]"}`}>
              {tb.icon} {tb.label}
            </button>
          ))}
        </div>
        {tab === "engagement" ? (
          <button onClick={genIdeas} disabled={ideasBusy}
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60"
            style={{ background: "var(--purple)" }}>
            {ideasBusy ? <Loader2 size={13} className="animate-spin" /> : <Lightbulb size={13} />}
            {ideasBusy ? t("Thinking…", "सोच रहे…") : ideas.length ? t("New ideas", "नए आइडिया") : t("Generate ideas", "आइडिया बनाएँ")}
          </button>
        ) : (
          <button onClick={() => load(tab)}
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg text-[var(--text-2)] border border-[var(--border)]">
            <RefreshCw size={13} /> {t("Refresh", "रिफ़्रेश")}
          </button>
        )}
      </div>

      {tab === "news" && (
        <p className="text-[12px] text-[var(--text-3)] mb-3 -mt-1">
          {t("Confirmed news stories (3+ sources) — turn any into a ready-to-post social pack.",
             "पुष्ट खबरें (3+ स्रोत) — किसी को भी पोस्ट-रेडी सोशल पैक में बदलें।")}
        </p>
      )}
      {tab === "engagement" && (
        <p className="text-[12px] text-[var(--text-3)] mb-3 -mt-1">
          {t("Ideas to engage your news audience — polls, debates, local-pride prompts, fact-checks — grounded in today's stories.",
             "अपने पाठकों को जोड़ने के आइडिया — पोल, चर्चा, शहर-गौरव, फैक्ट-चेक — आज की खबरों पर आधारित।")}
        </p>
      )}
      {tab === "saved" && (
        <p className="text-[12px] text-[var(--text-3)] mb-3 -mt-1">
          {t("Your saved creative packs — ready to copy and post.",
             "आपके सहेजे गए पैक — कॉपी करके पोस्ट करने के लिए तैयार।")}
        </p>
      )}

      {error && <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[#fee2e2] text-[#991b1b]">{error}</div>}

      {/* ── NEWS ── */}
      {tab === "news" && (
        loading ? <Loading t={t} /> :
        news.length === 0 ? <Empty text={t("No active news stories right now.", "अभी कोई सक्रिय न्यूज़ स्टोरी नहीं।")} /> : (
          <div className="space-y-2.5">
            {news.map((n) => (
              <div key={n.id} className="border border-[var(--border)] rounded-xl bg-white overflow-hidden">
                <div className="p-3.5 flex gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)] mb-1">
                      <Newspaper size={12} className="text-[var(--purple)]" />
                      {n.desk && <span className="font-medium text-[var(--text-2)]">{n.desk}</span>}
                      {n.publisher_count != null && <span>· {n.publisher_count} {t("sources", "स्रोत")}</span>}
                      {n.last_updated && <span>· {ago(n.last_updated, lang)}</span>}
                    </div>
                    <p className="text-[14px] font-medium leading-snug line-clamp-2">
                      {lang === "hi" && n.title_hi ? n.title_hi : n.title}
                    </p>
                  </div>
                  <GenButton busy={genBusy === n.id} label={genLabel(n.id)} disabled={genBusy !== null} onClick={() => toggle(n.id)} />
                </div>
                {panelFor(n.id)}
              </div>
            ))}
          </div>
        )
      )}

      {/* ── ENGAGEMENT IDEAS ── */}
      {tab === "engagement" && (
        ideasBusy ? <Loading t={t} label={t("Thinking up engagement ideas…", "एंगेजमेंट आइडिया सोच रहे…")} /> :
        ideas.length === 0 ? (
          <div className="border border-dashed border-[var(--border)] rounded-xl py-14 text-center">
            <Lightbulb size={24} className="mx-auto text-[var(--text-3)] mb-2" />
            <p className="text-[13px] text-[var(--text-3)] mb-3">
              {t("Generate ideas to engage your news-reading audience.", "अपने पाठकों को जोड़ने के लिए आइडिया बनाएँ।")}
            </p>
            <button onClick={genIdeas} className="text-[12px] font-medium px-4 py-2 rounded-lg text-white" style={{ background: "var(--purple)" }}>
              {t("Generate ideas", "आइडिया बनाएँ")}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {ideas.map((idea) => (
              <div key={idea.id} className="border border-[var(--border)] rounded-xl bg-white overflow-hidden">
                <div className="p-3.5 flex gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] mb-1 flex-wrap">
                      <span className="font-semibold uppercase tracking-wide text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: "color-mix(in srgb, var(--purple) 12%, transparent)", color: "var(--purple)" }}>
                        {lang === "hi" ? FMT[idea.format].hi : FMT[idea.format].en}
                      </span>
                      <span className="text-white text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: VERDICT_BG[idea.metrics.color] }}>
                        {verdictWord(idea.metrics.verdict, t)}
                      </span>
                      <Dots n={idea.metrics.estimate_dots} />
                      {idea.tie ? (
                        <span className="text-[var(--text-3)] truncate max-w-[240px]">· {t("on", "विषय")}: {idea.tie.trend_title}</span>
                      ) : idea.metrics.season ? (
                        <span className="text-[var(--text-3)]">· {idea.metrics.season}</span>
                      ) : null}
                    </div>
                    <p className="text-[14px] font-medium leading-snug">{lang === "hi" ? idea.title.hi : idea.title.en}</p>
                    <p className="text-[12px] text-[var(--text-2)] mt-0.5 leading-snug">{lang === "hi" ? idea.brief.hi : idea.brief.en}</p>
                    <p className="text-[11.5px] text-[var(--text-3)] mt-1 italic">→ {lang === "hi" ? idea.cta.hi : idea.cta.en}</p>
                  </div>
                  <GenButton busy={genBusy === idea.id} label={genLabel(idea.id)} disabled={genBusy !== null} onClick={() => toggle(idea.id)} />
                </div>
                {panelFor(idea.id)}
              </div>
            ))}
          </div>
        )
      )}

      {/* ── SAVED ── */}
      {tab === "saved" && (
        loading ? <Loading t={t} /> :
        saved.length === 0 ? <Empty text={t("Nothing saved yet. Generate a post and press Save.", "अभी कुछ सहेजा नहीं। पोस्ट बनाकर सेव दबाएँ।")} /> : (
          <div className="space-y-2.5">
            {saved.map((sp) => (
              <SavedCard key={sp.id} sp={sp} lang={lang} t={t} copy={copy} copied={copied} onRemove={() => removeSaved(sp.id)} />
            ))}
          </div>
        )
      )}
    </>
  );
}

function Loading({ t, label }: { t: (e: string, h: string) => string; label?: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-10">
      <Loader2 size={15} className="animate-spin" /> {label ?? t("Loading…", "लोड हो रहा है…")}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-[var(--border)] rounded-xl py-14 text-center text-[13px] text-[var(--text-3)]">{text}</div>
  );
}
function GenButton({ busy, label, disabled, onClick }: { busy: boolean; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="shrink-0 self-start flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
      style={{ background: "var(--purple)" }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
      {label}
    </button>
  );
}

const VERDICT_BG: Record<string, string> = { red: "#dc2626", amber: "#d97706", green: "#16a34a" };
function verdictWord(v: string, t: (e: string, h: string) => string): string {
  const m: Record<string, string> = {
    SKIP: t("Skip", "छोड़ें"), MAYBE: t("Maybe", "शायद"),
    "POST NOW": t("Post now", "अभी पोस्ट करें"), QUEUE: t("Queue", "कतार में"), REVIEW: t("Review", "समीक्षा"),
  };
  return m[v] ?? v;
}
function Dots({ n, total = 5 }: { n: number; total?: number }) {
  return (
    <span className="tracking-tight" style={{ letterSpacing: "1px" }} aria-label={`${n}/${total}`}>
      {"●".repeat(Math.max(0, Math.min(n, total)))}
      <span className="text-[var(--text-3)]">{"○".repeat(Math.max(0, total - n))}</span>
    </span>
  );
}

/* ── Trend / news scorecard (momentum + AI split bar) ─────────────────────── */

const LIVE = "#0891b2";

function Scorecard({ m, t }: { m: Metrics; t: (e: string, h: string) => string }) {
  const [open, setOpen] = useState(false);

  const appealWord: Record<string, string> = {
    below_average: t("Weak", "कमज़ोर"), average: t("Fair", "ठीक-ठाक"),
    strong: t("Strong", "मज़बूत"), exceptional: t("Standout", "असाधारण"),
  };
  const appealDots: Record<string, number> = { below_average: 1, average: 2, strong: 3, exceptional: 4 };
  const driverWord: Record<string, string> = {
    curiosity: t("Curiosity", "जिज्ञासा"), outrage: t("Outrage", "आक्रोश"),
    inspiration: t("Inspiration", "प्रेरणा"), utility: t("Useful", "उपयोगी"),
    awe: t("Awe", "विस्मय"), humor: t("Humour", "हास्य"), fear: t("Fear", "भय"), pride: t("Pride", "गर्व"),
  };
  const langW: Record<string, string> = { hindi: t("Hindi", "हिंदी"), english: t("English", "अंग्रेज़ी"), both: t("Both", "दोनों") };
  const riskReason: Record<string, string> = {
    communal: t("Communal-sensitive", "सांप्रदायिक"), legal_defamation: t("Legal / defamation", "कानूनी / मानहानि"),
    unverified: t("Unverified", "असत्यापित"), sensitive: t("Sensitive", "संवेदनशील"), none: "",
  };
  const platIcon: Record<string, React.ReactNode> = {
    x: <AtSign size={12} />, ig: <Camera size={12} />, fb: <ThumbsUp size={12} />, yt: <Play size={12} />,
  };
  const platName: Record<string, string> = { x: "X", ig: "Instagram", fb: "Facebook", yt: "YouTube" };
  const subWord: Record<string, string> = {
    hook_strength: t("hook", "हुक"), shareability: t("shareability", "शेयरेबिलिटी"),
    emotional_pull: t("emotional pull", "भावनात्मक असर"), clarity: t("clarity", "स्पष्टता"),
  };
  const confWord: Record<string, string> = { low: t("Low", "कम"), med: t("Med", "मध्यम"), high: t("High", "उच्च") };
  const momentumLabel = m.momentum_kind === "confirmation" ? t("Confirmation", "पुष्टि") : t("Live buzz", "लाइव बज़");
  const fmtName = m.recommended_format.charAt(0).toUpperCase() + m.recommended_format.slice(1);
  const appealN = appealDots[m.click_appeal] ?? 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
      <div className="p-3 flex items-center gap-2.5 flex-wrap">
        <span className="text-white text-[12px] font-bold px-2.5 py-1 rounded-md tracking-wide" style={{ background: VERDICT_BG[m.color] }}>
          {verdictWord(m.verdict, t)}
        </span>
        <span className="text-[13px] font-semibold text-[var(--text)]">
          {t("Priority", "प्राथमिकता")} {m.priority_score}<span className="text-[var(--text-3)] font-normal text-[11px]"> / 100</span>
        </span>
        <span className="ml-auto text-[10.5px] text-[var(--text-3)] flex items-center gap-1">
          {t("AI conf.", "AI विश्वास")}<span className="font-semibold text-[var(--text-2)]">{confWord[m.confidence]}</span>
        </span>
      </div>
      <div className="px-3">
        <div className="h-2 w-full rounded-full bg-[var(--surface-2)] overflow-hidden flex">
          <div style={{ width: `${m.momentum_part}%`, background: LIVE }} title={`${momentumLabel} ${m.momentum}`} />
          <div style={{
            width: `${m.content_part}%`,
            backgroundImage: `repeating-linear-gradient(45deg, var(--purple), var(--purple) 3px, transparent 3px, transparent 6px)`,
            backgroundColor: "color-mix(in srgb, var(--purple) 22%, transparent)",
          }} title={t("Copy (AI read)", "कॉपी (AI आकलन)")} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-3)]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: LIVE }} /> {momentumLabel} {m.momentum}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: "var(--purple)" }} /> {t("Copy (AI)", "कॉपी (AI)")}</span>
        </div>
      </div>
      <div className="mt-3 mx-3 rounded-md border-l-2 px-2.5 py-1.5 text-[11.5px] flex items-center gap-1.5"
        style={{ borderColor: LIVE, background: "color-mix(in srgb, #0891b2 7%, transparent)" }}>
        <span className="text-[9px] font-bold tracking-wide flex items-center gap-1" style={{ color: LIVE }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: LIVE }} /> LIVE
        </span>
        <span className="text-[var(--text-2)]">{m.freshness_line}</span>
      </div>
      <div className="mt-2 mx-3 mb-3 rounded-md border-l-2 border-[var(--purple)] px-2.5 py-2" style={{ background: "color-mix(in srgb, var(--purple) 5%, transparent)" }}>
        <div className="text-[9px] font-bold tracking-wide text-[var(--purple)] mb-1.5 flex items-center gap-1">◆ {t("AI ESTIMATE", "AI अनुमान")}</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip icon={platIcon[m.best_platform.pick]} text={`${platName[m.best_platform.pick]} · ${fmtName}`} />
          <Chip icon={<Clock size={11} />} text={m.perishable_now ? t("Post now", "अभी") : m.best_time_ist} />
          <Chip icon={<Languages size={11} />} text={langW[m.recommended_language]} />
          <Chip text={`${t("Angle", "एंगल")}: ${driverWord[m.emotional_driver] ?? m.emotional_driver}`} />
          <span className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded bg-white border border-[var(--border)] text-[var(--text-2)]">
            {t("Appeal", "आकर्षण")}<Dots n={appealN} total={4} />{appealWord[m.click_appeal]}
          </span>
        </div>
        {m.risk.level !== "low" && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] px-2 py-1 rounded"
            style={{ background: m.risk.level === "high" ? "#fef2f2" : "#fffbeb", color: m.risk.level === "high" ? "#991b1b" : "#92400e" }}>
            <ShieldAlert size={12} />
            <span className="font-semibold">{m.risk.level === "high" ? t("High risk", "उच्च जोखिम") : t("Check", "जाँचें")}</span>
            {riskReason[m.risk.reason] && <span>· {riskReason[m.risk.reason]}</span>}
          </div>
        )}
        <button onClick={() => setOpen((o) => !o)} className="mt-1.5 text-[10.5px] text-[var(--text-3)] hover:text-[var(--text)]">
          {open ? t("Less ▲", "कम ▲") : t("Why / audience ▾", "कारण / ऑडियंस ▾")}
        </button>
        {open && (
          <div className="mt-1.5 space-y-1 text-[11px] text-[var(--text-2)]">
            {m.best_platform.why && <div><span className="text-[var(--text-3)]">{platName[m.best_platform.pick]}: </span>{m.best_platform.why}</div>}
            {m.target_audience && <div><span className="text-[var(--text-3)]">{t("Likely audience: ", "संभावित ऑडियंस: ")}</span>{m.target_audience}</div>}
            <div className="text-[var(--text-3)]">{t("Weakest in copy: ", "कॉपी में सबसे कमज़ोर: ")}{subWord[m.content_weakest.key] ?? m.content_weakest.key}</div>
          </div>
        )}
      </div>
      <HonestyNote t={t} />
    </div>
  );
}

/* ── Engagement scorecard (tied vs evergreen, ordinal) ────────────────────── */

function EngagementScorecard({ m, t }: { m: EngagementMetrics; t: (e: string, h: string) => string }) {
  const estWord: Record<string, string> = {
    Minimal: t("Minimal", "न्यूनतम"), Low: t("Low", "कम"), Moderate: t("Moderate", "मध्यम"),
    High: t("High", "ऊँचा"), "Very high": t("Very high", "बहुत ऊँचा"),
  };
  const momWord: Record<string, string> = { Rising: t("Rising", "बढ़ता"), Steady: t("Steady", "स्थिर"), Fading: t("Fading", "ढलता") };
  const pegWord: Record<string, string> = {
    "Today peg": t("Today peg", "आज का अवसर"), "Cadence slot": t("Cadence slot", "नियमित स्लॉट"), "Always-on": t("Always-on", "सदाबहार"),
  };
  const sensWord: Record<string, string> = {
    political: t("Political", "राजनीतिक"), communal: t("Communal", "सांप्रदायिक"), legal_subjudice: t("Sub-judice", "विचाराधीन"),
    tragic: t("Tragic / sensitive", "दुखद / संवेदनशील"), health_medical: t("Health / medical", "स्वास्थ्य"), minor: t("Involves a minor", "नाबालिग शामिल"), none: "",
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
      <div className="p-3 flex items-center gap-2.5 flex-wrap">
        <span className="text-white text-[12px] font-bold px-2.5 py-1 rounded-md tracking-wide" style={{ background: VERDICT_BG[m.color] }}>
          {verdictWord(m.verdict, t)}
        </span>
        <span className="text-[11.5px] text-[var(--text-3)]">
          {m.priority_label === "act_now" ? t("Act-now priority", "तुरंत प्राथमिकता") : t("Queue priority", "कतार प्राथमिकता")}
        </span>
      </div>

      {/* ◆ AI estimate — always present, ordinal only */}
      <div className="mx-3 rounded-md border-l-2 border-[var(--purple)] px-2.5 py-2" style={{ background: "color-mix(in srgb, var(--purple) 5%, transparent)" }}>
        <div className="text-[9px] font-bold tracking-wide text-[var(--purple)] mb-1 flex items-center gap-1">◆ {t("AI ESTIMATE", "AI अनुमान")}</div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-semibold text-[var(--text)]">{t("Engagement", "एंगेजमेंट")}</span>
          <Dots n={m.estimate_dots} />
          <span className="text-[var(--text-2)]">{estWord[m.estimate]}</span>
        </div>
      </div>

      {/* ● tied / ○ evergreen live lane */}
      {m.tied ? (
        <div className="mt-2 mx-3 mb-3 rounded-md border-l-2 px-2.5 py-1.5 text-[11.5px] flex items-center gap-1.5 flex-wrap"
          style={{ borderColor: LIVE, background: "color-mix(in srgb, #0891b2 7%, transparent)" }}>
          <span className="text-[9px] font-bold tracking-wide flex items-center gap-1" style={{ color: LIVE }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: LIVE }} /> LIVE
          </span>
          <span className="text-[var(--text-2)]">
            {t("Tied story", "जुड़ी खबर")}
            {m.tied.publisher_count != null ? ` · ${m.tied.publisher_count} ${t("outlets", "प्रकाशक")}` : ""}
            {` · ${m.tied.age_label}`}
          </span>
          <span className="text-[var(--text-3)]">· {t("Momentum", "गति")}: {momWord[m.tied.momentum]}</span>
        </div>
      ) : (
        <div className="mt-2 mx-3 mb-3 rounded-md border-l-2 border-[var(--border)] px-2.5 py-1.5 text-[11.5px] flex items-center gap-1.5 flex-wrap bg-[var(--surface-2)]">
          <span className="text-[9px] font-bold tracking-wide text-[var(--text-3)] flex items-center gap-1"
            title={t("Original Patrika post, not tied to a live story — nothing external to measure.", "मौलिक पोस्ट, किसी लाइव खबर से नहीं जुड़ी — मापने के लिए कोई बाहरी संकेत नहीं।")}>
            <span className="w-1.5 h-1.5 rounded-full inline-block border border-[var(--text-3)]" /> {t("NO LIVE SIGNAL · Evergreen", "कोई लाइव संकेत नहीं · सदाबहार")}
          </span>
          <span className="text-[var(--text-3)] flex items-center gap-1">· <Calendar size={11} /> {m.timing_peg ? pegWord[m.timing_peg] : ""}{m.season ? ` · ${m.season}` : ""}</span>
        </div>
      )}

      {m.sensitivity !== "none" && (
        <div className="mx-3 mb-3 flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-[#fffbeb] text-[#92400e]">
          <ShieldAlert size={12} />
          <span className="font-semibold">{t("Desk sign-off needed", "डेस्क अनुमोदन आवश्यक")}</span>
          {sensWord[m.sensitivity] && <span>· {sensWord[m.sensitivity]}</span>}
        </div>
      )}
      <HonestyNote t={t} />
    </div>
  );
}

function HonestyNote({ t }: { t: (e: string, h: string) => string }) {
  return (
    <div className="px-3 pb-2 text-[9.5px] text-[var(--text-3)] leading-snug">
      {t("AI estimate for planning — not measured analytics. Real signals are shown raw; the AI read never uses a % or decimal.",
         "योजना के लिए AI अनुमान — मापा गया विश्लेषण नहीं। असली संकेत जस के तस; AI अनुमान में कभी % या दशमलव नहीं।")}
    </div>
  );
}

function Chip({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded bg-white border border-[var(--border)] text-[var(--text-2)]">
      {icon}{text}
    </span>
  );
}

/* ── Creative pack panel ──────────────────────────────────────────────────── */

function CreativePanel({
  id, pack, scorecard, showCrossCheck, corroboration, image, imgBusy, saving, savedFlash,
  onImage, onRegenerate, onSave, copy, copied, t,
}: {
  id: string; pack: Pack; scorecard: React.ReactNode; showCrossCheck: boolean; corroboration: Corro[];
  image: string | null; imgBusy: boolean; saving: boolean; savedFlash: boolean;
  onImage: () => void; onRegenerate: () => void; onSave: () => void;
  copy: (k: string, text: string) => void; copied: string | null; t: (en: string, hi: string) => string;
}) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
      {scorecard}
      <div className="text-[12px] text-[var(--text-2)]"><span className="font-semibold">{t("Angle", "एंगल")}: </span>{pack.angle}</div>
      <CopyBlock label="X / Twitter" text={pack.x} k={`x${id}`} copied={copied} onCopy={copy} />
      <CopyBlock label="Instagram" text={pack.instagram} k={`ig${id}`} copied={copied} onCopy={copy} />
      <CopyBlock label="Facebook" text={pack.facebook} k={`fb${id}`} copied={copied} onCopy={copy} />
      <CopyBlock label={t("YouTube title", "यूट्यूब शीर्षक")} text={pack.youtube_title} k={`yt${id}`} copied={copied} onCopy={copy} />
      <Hashtags tags={pack.hashtags} />
      <div className="text-[12px]"><span className="font-semibold">{t("Image concept", "इमेज कॉन्सेप्ट")}: </span><span className="text-[var(--text-2)]">{pack.image_concept}</span></div>
      <div>
        {image ? (
          <div className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="w-full max-w-[320px] rounded-lg border border-[var(--border)]" />
            <div className="flex gap-3">
              <a href={image} download={`patrika-social-${id}.png`} className="text-[11px] text-[var(--purple)] hover:underline">{t("Download", "डाउनलोड")}</a>
              <button onClick={onImage} disabled={imgBusy} className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)]">
                {imgBusy ? t("Generating…", "बना रहे…") : t("↻ Regenerate image", "↻ इमेज फिर बनाएँ")}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={onImage} disabled={imgBusy} className="text-[11px] font-medium bg-[var(--text)] hover:bg-black text-white px-3 py-1.5 rounded disabled:opacity-50">
            {imgBusy ? t("Generating image…", "इमेज बना रहे…") : t("🖼 Generate creative image", "🖼 क्रिएटिव इमेज बनाएँ")}
          </button>
        )}
      </div>
      {showCrossCheck && <CrossCheck corroboration={corroboration} t={t} />}
      {pack.caution && <div className="text-[11.5px] text-[#92400e] bg-[#fef3c7] rounded-lg px-3 py-2 leading-snug">⚠ {pack.caution}</div>}
      <div className="flex items-center gap-3 pt-0.5">
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
          style={{ background: savedFlash ? "var(--green)" : "var(--text)" }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : savedFlash ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
          {savedFlash ? t("Saved", "सहेजा गया") : t("Save post", "पोस्ट सेव करें")}
        </button>
        <button onClick={onRegenerate} className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)]">{t("↻ Regenerate", "↻ फिर से बनाएँ")}</button>
      </div>
    </div>
  );
}

/* ── Saved card ───────────────────────────────────────────────────────────── */

function SavedCard({
  sp, lang, t, copy, copied, onRemove,
}: {
  sp: SavedPost; lang: string; t: (e: string, h: string) => string;
  copy: (k: string, text: string) => void; copied: string | null; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);

  useEffect(() => {
    if (!open || !sp.has_image || img !== null || imgLoading) return;
    setImgLoading(true);
    fetch(`/api/social/saved/${sp.id}`)
      .then((r) => r.json())
      .then((j) => setImg(typeof j.image === "string" ? j.image : null))
      .catch(() => {})
      .finally(() => setImgLoading(false));
  }, [open, sp.has_image, sp.id, img, imgLoading]);

  const isEng = !!sp.metrics && "variant" in sp.metrics && sp.metrics.variant === "engagement";

  return (
    <div className="border border-[var(--border)] rounded-xl bg-white overflow-hidden">
      <div className="p-3.5 flex gap-3 items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)] mb-1">
            <span className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: sp.kind === "news" ? "color-mix(in srgb, var(--purple) 12%, transparent)" : "var(--surface-2)", color: "var(--text-2)" }}>
              {sp.kind === "news" ? t("News", "न्यूज़") : t("Engagement", "एंगेजमेंट")}
            </span>
            {sp.metrics && (
              <span className="text-white text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: VERDICT_BG[sp.metrics.color] }}>
                {verdictWord(sp.metrics.verdict, t)}
              </span>
            )}
            <span>· {ago(sp.created_at, lang)}</span>
            {sp.created_by_name && <span>· {sp.created_by_name}</span>}
          </div>
          <p className="text-[14px] font-medium leading-snug line-clamp-2">{sp.title || sp.pack.angle}</p>
        </div>
        <button onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]">
          {open ? t("Hide", "छिपाएँ") : t("View", "देखें")}
        </button>
        <button onClick={onRemove} title={t("Delete", "हटाएँ")} className="shrink-0 text-[var(--text-3)] hover:text-[var(--red)] p-1.5"><Trash2 size={15} /></button>
      </div>
      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
          {sp.metrics && (isEng ? <EngagementScorecard m={sp.metrics as EngagementMetrics} t={t} /> : <Scorecard m={sp.metrics as Metrics} t={t} />)}
          <CopyBlock label="X / Twitter" text={sp.pack.x} k={`sx${sp.id}`} copied={copied} onCopy={copy} />
          <CopyBlock label="Instagram" text={sp.pack.instagram} k={`sig${sp.id}`} copied={copied} onCopy={copy} />
          <CopyBlock label="Facebook" text={sp.pack.facebook} k={`sfb${sp.id}`} copied={copied} onCopy={copy} />
          <CopyBlock label={t("YouTube title", "यूट्यूब शीर्षक")} text={sp.pack.youtube_title} k={`syt${sp.id}`} copied={copied} onCopy={copy} />
          <Hashtags tags={sp.pack.hashtags} />
          {sp.has_image && (
            imgLoading && !img ? (
              <div className="text-[11px] text-[var(--text-3)] flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> {t("Loading image…", "इमेज लोड हो रही…")}</div>
            ) : img ? (
              <div className="space-y-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="w-full max-w-[320px] rounded-lg border border-[var(--border)]" />
                <a href={img} download={`patrika-social-${sp.id}.png`} className="text-[11px] text-[var(--purple)] hover:underline">{t("Download", "डाउनलोड")}</a>
              </div>
            ) : null
          )}
          {!isEng && <CrossCheck corroboration={sp.corroboration ?? []} t={t} />}
          {sp.pack.caution && <div className="text-[11.5px] text-[#92400e] bg-[#fef3c7] rounded-lg px-3 py-2 leading-snug">⚠ {sp.pack.caution}</div>}
        </div>
      )}
    </div>
  );
}

/* ── Small shared pieces ──────────────────────────────────────────────────── */

function Hashtags({ tags }: { tags: string[] }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((h, i) => (
        <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-[var(--border)] text-[var(--text-2)]">
          {h.startsWith("#") ? h : `#${h}`}
        </span>
      ))}
    </div>
  );
}

function CrossCheck({ corroboration, t }: { corroboration: Corro[]; t: (e: string, h: string) => string }) {
  return (
    <div className="text-[11.5px]">
      {corroboration.length > 0 ? (
        <div className="bg-[#ecfdf5] border border-[#a7f3d0] rounded-lg px-3 py-2">
          <div className="font-semibold text-[#065f46] mb-1">{t("✓ Reported by trusted media", "✓ विश्वसनीय मीडिया में मौजूद")}</div>
          <ul className="space-y-0.5">
            {corroboration.map((c, i) => (
              <li key={i} className="text-[var(--text-2)] leading-snug">
                {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.title.slice(0, 72)}</a> : <span>{c.title.slice(0, 72)}</span>}
                <span className="text-[var(--text-3)]"> · {c.source}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bg-[#fef2f2] border border-[#fecaca] rounded-lg px-3 py-2 text-[#991b1b] leading-snug">
          {t("⚠ No trusted news coverage found — likely unverified. Verify before posting.",
             "⚠ किसी विश्वसनीय समाचार स्रोत में नहीं मिला — असत्यापित हो सकता है। पोस्ट करने से पहले जांचें।")}
        </div>
      )}
    </div>
  );
}

function CopyBlock({
  label, text, k, copied, onCopy,
}: { label: string; text: string; k: string; copied: string | null; onCopy: (k: string, t: string) => void }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)] font-semibold">{label}</span>
        <button onClick={() => onCopy(k, text)} className="text-[var(--text-3)] hover:text-[var(--text)]">
          {copied === k ? <Check size={13} className="text-[var(--green)]" /> : <Copy size={13} />}
        </button>
      </div>
      <p className="text-[12.5px] text-[var(--text)] whitespace-pre-wrap leading-snug">{text}</p>
    </div>
  );
}
