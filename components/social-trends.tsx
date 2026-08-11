"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Sparkles, Flame, MessageCircle, ArrowUp, ExternalLink,
  Copy, Check, AtSign, Globe, Newspaper, Bookmark, BookmarkCheck, Trash2,
  Camera, ThumbsUp, Play, Clock, Languages, ShieldAlert,
} from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import type { Metrics } from "@/lib/social/scorecard";

type Platform = "reddit" | "x";

type Trend = {
  id: string;
  platform: Platform;
  title: string;
  body: string;
  url: string | null;
  permalink: string | null;
  thumbnail: string | null;
  author: string | null;
  origin: string | null;
  score: number;
  comments: number;
  posted_at: string | null;
  heat: number;
  has_creative: boolean;
};

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

type SavedPost = {
  id: string;
  kind: "news" | "engagement";
  title: string;
  lang: string;
  pack: Pack;
  metrics: Metrics | null;
  corroboration: Corro[] | null;
  has_image: boolean;
  created_at: string;
  created_by_name: string | null;
};

type Tab = "news" | "engagement" | "saved";

function ago(iso: string | null, lang: string): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}
function num(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}
const PIcon = (p: Platform) =>
  p === "x" ? <AtSign size={13} /> : <Globe size={13} className="text-[#ff4500]" />;

export function SocialTrends() {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [tab, setTab] = useState<Tab>("news");
  const [trends, setTrends] = useState<Trend[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [saved, setSaved] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
    setLoading(true);
    try {
      if (which === "news") {
        const res = await fetch("/api/social/news");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed");
        setNews(json.trends ?? []);
      } else if (which === "engagement") {
        const res = await fetch(`/api/social/trends?days=3`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed");
        setTrends(json.trends ?? []);
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
    setImage(null); setNote(null); setError(null); setSavedFlash(false);
  }

  // Toggle a post open/closed. Re-showing a post we already generated must NOT
  // fire a fresh (paid, non-deterministic) generation — only generate when
  // there is no cached pack for this item.
  function toggle(id: string) {
    if (openId === id) setOpenId(null);
    else if (packId === id && pack) setOpenId(id);
    else generate(id);
  }

  async function crawl() {
    setCrawling(true); setNote(null); setError(null);
    try {
      const res = await fetch("/api/social/trends/crawl", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "Failed");
      const firstErr = (json.results ?? []).find((r: { error: string | null }) => r.error)?.error;
      setNote(t(
        `${json.items_upserted} new · ${json.sources_ok}/${json.sources} sources${firstErr ? ` — ${firstErr}` : ""}`,
        `${json.items_upserted} नए · ${json.sources} में से ${json.sources_ok}${firstErr ? ` — ${firstErr}` : ""}`
      ));
      await load("engagement");
    } catch (e) { setError(e instanceof Error ? e.message : "Crawl failed"); }
    finally { setCrawling(false); }
  }

  async function generate(id: string) {
    setGenBusy(id); setError(null); setSavedFlash(false);
    try {
      const url = tab === "news"
        ? `/api/social/news/${id}/generate`
        : `/api/social/trends/${id}/generate`;
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "Failed");
      setPack(json.pack);
      setPackId(id);
      setMetrics(json.metrics ?? null);
      setCorroboration(Array.isArray(json.corroboration) ? json.corroboration : []);
      setImage(null);
      setOpenId(id);
      if (tab === "engagement") {
        setTrends((prev) => prev.map((tr) => (tr.id === id ? { ...tr, has_creative: true } : tr)));
      }
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
    if (tab === "news") {
      const n = news.find((x) => x.id === id);
      title = (lang === "hi" && n?.title_hi ? n.title_hi : n?.title) ?? "";
    } else {
      title = trends.find((tr) => tr.id === id)?.title ?? "";
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/social/saved", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: tab === "news" ? "news" : "engagement",
          source_ref: id, title, lang, pack, metrics, corroboration, image,
        }),
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
    catch { /* optimistic — reload to resync */ await load("saved"); }
  }

  function copy(key: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  const panelFor = (id: string) =>
    openId === id && pack ? (
      <CreativePanel
        id={id} pack={pack} metrics={metrics} corroboration={corroboration} image={image} imgBusy={imgBusy}
        saving={saving} savedFlash={savedFlash}
        onImage={() => genImage(id)} onRegenerate={() => generate(id)} onSave={() => save(id)}
        copy={copy} copied={copied} t={t}
      />
    ) : null;

  const genLabel = (id: string, has: boolean) =>
    genBusy === id ? t("Writing…", "लिख रहे…")
      : has || openId === id || packId === id ? t("View post", "पोस्ट देखें")
      : t("Generate post", "पोस्ट बनाएँ");

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
          <button onClick={crawl} disabled={crawling}
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60"
            style={{ background: "var(--purple)" }}>
            {crawling ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {crawling ? t("Refreshing…", "रिफ़्रेश…") : t("Refresh", "रिफ़्रेश")}
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
      {tab === "saved" && (
        <p className="text-[12px] text-[var(--text-3)] mb-3 -mt-1">
          {t("Your saved creative packs — ready to copy and post.",
             "आपके सहेजे गए पैक — कॉपी करके पोस्ट करने के लिए तैयार।")}
        </p>
      )}

      {note && <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text-2)]">{note}</div>}
      {error && <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[#fee2e2] text-[#991b1b]">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-10">
          <Loader2 size={15} className="animate-spin" /> {t("Loading…", "लोड हो रहा है…")}
        </div>
      ) : tab === "engagement" ? (
        trends.length === 0 ? (
          <Empty t={t} text={t("No trends yet. Press Refresh to crawl now.", "अभी कोई ट्रेंड नहीं। रिफ़्रेश दबाएँ।")} />
        ) : (
          <div className="space-y-2.5">
            {trends.map((tr) => (
              <div key={tr.id} className="border border-[var(--border)] rounded-xl bg-white overflow-hidden">
                <div className="p-3.5 flex gap-3">
                  {tr.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tr.thumbnail} alt="" className="w-16 h-16 object-cover rounded-lg border border-[var(--border)] shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)] mb-1">
                      {PIcon(tr.platform)}
                      <span className="font-medium text-[var(--text-2)]">{tr.origin}</span>
                      {tr.author && <span>· {tr.author}</span>}
                      {tr.posted_at && <span>· {ago(tr.posted_at, lang)}</span>}
                    </div>
                    <p className="text-[14px] font-medium leading-snug line-clamp-2">{tr.title}</p>
                    <div className="flex items-center gap-3 text-[11px] text-[var(--text-3)] mt-1.5">
                      <span className="flex items-center gap-0.5"><ArrowUp size={11} /> {num(tr.score)}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle size={11} /> {num(tr.comments)}</span>
                      <span className="flex items-center gap-0.5 text-[#ea580c]"><Flame size={11} /> {tr.heat}</span>
                      {tr.permalink && (
                        <a href={tr.permalink} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text)] flex items-center gap-0.5">
                          {t("source", "स्रोत")} <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                  <GenButton busy={genBusy === tr.id} label={genLabel(tr.id, tr.has_creative)}
                    disabled={genBusy !== null} onClick={() => toggle(tr.id)} />
                </div>
                {panelFor(tr.id)}
              </div>
            ))}
          </div>
        )
      ) : tab === "news" ? (
        news.length === 0 ? (
          <Empty t={t} text={t("No active news stories right now.", "अभी कोई सक्रिय न्यूज़ स्टोरी नहीं।")} />
        ) : (
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
                  <GenButton busy={genBusy === n.id} label={genLabel(n.id, false)}
                    disabled={genBusy !== null} onClick={() => toggle(n.id)} />
                </div>
                {panelFor(n.id)}
              </div>
            ))}
          </div>
        )
      ) : saved.length === 0 ? (
        <Empty t={t} text={t("Nothing saved yet. Generate a post and press Save.", "अभी कुछ सहेजा नहीं। पोस्ट बनाकर सेव दबाएँ।")} />
      ) : (
        <div className="space-y-2.5">
          {saved.map((sp) => (
            <SavedCard key={sp.id} sp={sp} lang={lang} t={t} copy={copy} copied={copied} onRemove={() => removeSaved(sp.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function Empty({ text }: { t: (e: string, h: string) => string; text: string }) {
  return (
    <div className="border border-dashed border-[var(--border)] rounded-xl py-14 text-center text-[13px] text-[var(--text-3)]">
      {text}
    </div>
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

/* ── Scorecard ─────────────────────────────────────────────────────────────
   Honesty by construction: raw source counts shown verbatim in a ● LIVE lane;
   the model's copy read lives in a separate ◆ AI-estimate lane and never prints
   a percent or a decimal. The verdict word + colour is the 3-second read. */

const LIVE = "#0891b2"; // cyan — the "live / real signal" lane colour
const VERDICT_BG: Record<string, string> = { red: "#dc2626", amber: "#d97706", green: "#16a34a" };

function Scorecard({ m, t }: { m: Metrics; t: (e: string, h: string) => string }) {
  const [open, setOpen] = useState(false);

  const verdictWord: Record<string, string> = {
    SKIP: t("Skip", "छोड़ें"), MAYBE: t("Maybe", "शायद"),
    "POST NOW": t("Post now", "अभी पोस्ट करें"), QUEUE: t("Queue", "कतार में"),
    REVIEW: t("Review", "समीक्षा"),
  };
  const appealWord: Record<string, string> = {
    below_average: t("Weak", "कमज़ोर"), average: t("Fair", "ठीक-ठाक"),
    strong: t("Strong", "मज़बूत"), exceptional: t("Standout", "असाधारण"),
  };
  const appealDots: Record<string, number> = { below_average: 1, average: 2, strong: 3, exceptional: 4 };
  const driverWord: Record<string, string> = {
    curiosity: t("Curiosity", "जिज्ञासा"), outrage: t("Outrage", "आक्रोश"),
    inspiration: t("Inspiration", "प्रेरणा"), utility: t("Useful", "उपयोगी"),
    awe: t("Awe", "विस्मय"), humor: t("Humour", "हास्य"),
    fear: t("Fear", "भय"), pride: t("Pride", "गर्व"),
  };
  const langWord: Record<string, string> = {
    hindi: t("Hindi", "हिंदी"), english: t("English", "अंग्रेज़ी"), both: t("Both", "दोनों"),
  };
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
      {/* Headline: verdict + priority + confidence */}
      <div className="p-3 flex items-center gap-2.5 flex-wrap">
        <span className="text-white text-[12px] font-bold px-2.5 py-1 rounded-md tracking-wide"
          style={{ background: VERDICT_BG[m.color] }}>
          {verdictWord[m.verdict] ?? m.verdict}
        </span>
        <span className="text-[13px] font-semibold text-[var(--text)]">
          {t("Priority", "प्राथमिकता")} {m.priority_score}
          <span className="text-[var(--text-3)] font-normal text-[11px]"> / 100</span>
        </span>
        <span className="ml-auto text-[10.5px] text-[var(--text-3)] flex items-center gap-1"
          title={t("AI's confidence in its own estimates", "अपने अनुमानों में AI का विश्वास")}>
          {t("AI conf.", "AI विश्वास")}
          <span className="font-semibold text-[var(--text-2)]">{confWord[m.confidence]}</span>
        </span>
      </div>

      {/* Priority split bar: solid = live momentum, hatched = AI copy */}
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

      {/* ● LIVE lane — raw source numbers, verbatim */}
      <div className="mt-3 mx-3 rounded-md border-l-2 px-2.5 py-1.5 text-[11.5px] flex items-center gap-1.5"
        style={{ borderColor: LIVE, background: "color-mix(in srgb, #0891b2 7%, transparent)" }}>
        <span className="text-[9px] font-bold tracking-wide flex items-center gap-1" style={{ color: LIVE }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: LIVE }} /> LIVE
        </span>
        <span className="text-[var(--text-2)]">{m.freshness_line}</span>
      </div>

      {/* ◆ AI-estimate lane */}
      <div className="mt-2 mx-3 mb-3 rounded-md border-l-2 border-[var(--purple)] px-2.5 py-2"
        style={{ background: "color-mix(in srgb, var(--purple) 5%, transparent)" }}>
        <div className="text-[9px] font-bold tracking-wide text-[var(--purple)] mb-1.5 flex items-center gap-1">
          ◆ {t("AI ESTIMATE", "AI अनुमान")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip icon={platIcon[m.best_platform.pick]} text={`${platName[m.best_platform.pick]} · ${fmtName}`} />
          <Chip icon={<Clock size={11} />} text={m.perishable_now ? t("Post now", "अभी") : m.best_time_ist} />
          <Chip icon={<Languages size={11} />} text={langWord[m.recommended_language]} />
          <Chip text={`${t("Angle", "एंगल")}: ${driverWord[m.emotional_driver] ?? m.emotional_driver}`} />
          <span className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded bg-white border border-[var(--border)] text-[var(--text-2)]">
            {t("Appeal", "आकर्षण")}
            <span className="tracking-tight" style={{ letterSpacing: "1px" }}>
              {"●".repeat(appealN)}<span className="text-[var(--text-3)]">{"○".repeat(4 - appealN)}</span>
            </span>
            {appealWord[m.click_appeal]}
          </span>
        </div>

        {m.risk.level !== "low" && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] px-2 py-1 rounded"
            style={{
              background: m.risk.level === "high" ? "#fef2f2" : "#fffbeb",
              color: m.risk.level === "high" ? "#991b1b" : "#92400e",
            }}>
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
            <div className="text-[var(--text-3)]">
              {t("Weakest in copy: ", "कॉपी में सबसे कमज़ोर: ")}
              {subWord[m.content_weakest.key] ?? m.content_weakest.key}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 pb-2 text-[9.5px] text-[var(--text-3)] leading-snug">
        {t("AI estimate for planning — not measured analytics. Source counts are real; the AI read never uses a % or decimal.",
           "योजना के लिए AI अनुमान — मापा गया विश्लेषण नहीं। स्रोत आंकड़े असली हैं; AI अनुमान में कभी % या दशमलव नहीं।")}
      </div>
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

/* ── Creative pack panel (generate view) ──────────────────────────────────── */

function CreativePanel({
  id, pack, metrics, corroboration, image, imgBusy, saving, savedFlash,
  onImage, onRegenerate, onSave, copy, copied, t,
}: {
  id: string; pack: Pack; metrics: Metrics | null; corroboration: Corro[];
  image: string | null; imgBusy: boolean; saving: boolean; savedFlash: boolean;
  onImage: () => void; onRegenerate: () => void; onSave: () => void;
  copy: (k: string, text: string) => void; copied: string | null;
  t: (en: string, hi: string) => string;
}) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
      {metrics && <Scorecard m={metrics} t={t} />}

      <div className="text-[12px] text-[var(--text-2)]">
        <span className="font-semibold">{t("Angle", "एंगल")}: </span>{pack.angle}
      </div>
      <CopyBlock label="X / Twitter" text={pack.x} k={`x${id}`} copied={copied} onCopy={copy} />
      <CopyBlock label="Instagram" text={pack.instagram} k={`ig${id}`} copied={copied} onCopy={copy} />
      <CopyBlock label="Facebook" text={pack.facebook} k={`fb${id}`} copied={copied} onCopy={copy} />
      <CopyBlock label={t("YouTube title", "यूट्यूब शीर्षक")} text={pack.youtube_title} k={`yt${id}`} copied={copied} onCopy={copy} />
      <Hashtags tags={pack.hashtags} />
      <div className="text-[12px]">
        <span className="font-semibold">{t("Image concept", "इमेज कॉन्सेप्ट")}: </span>
        <span className="text-[var(--text-2)]">{pack.image_concept}</span>
      </div>

      <div>
        {image ? (
          <div className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="w-full max-w-[320px] rounded-lg border border-[var(--border)]" />
            <div className="flex gap-3">
              <a href={image} download={`patrika-social-${id}.png`} className="text-[11px] text-[var(--purple)] hover:underline">
                {t("Download", "डाउनलोड")}
              </a>
              <button onClick={onImage} disabled={imgBusy} className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)]">
                {imgBusy ? t("Generating…", "बना रहे…") : t("↻ Regenerate image", "↻ इमेज फिर बनाएँ")}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={onImage} disabled={imgBusy}
            className="text-[11px] font-medium bg-[var(--text)] hover:bg-black text-white px-3 py-1.5 rounded disabled:opacity-50">
            {imgBusy ? t("Generating image…", "इमेज बना रहे…") : t("🖼 Generate creative image", "🖼 क्रिएटिव इमेज बनाएँ")}
          </button>
        )}
      </div>

      <CrossCheck corroboration={corroboration} t={t} />

      {pack.caution && (
        <div className="text-[11.5px] text-[#92400e] bg-[#fef3c7] rounded-lg px-3 py-2 leading-snug">
          ⚠ {pack.caution}
        </div>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
          style={{ background: savedFlash ? "var(--green)" : "var(--text)" }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : savedFlash ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
          {savedFlash ? t("Saved", "सहेजा गया") : t("Save post", "पोस्ट सेव करें")}
        </button>
        <button onClick={onRegenerate} className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)]">
          {t("↻ Regenerate", "↻ फिर से बनाएँ")}
        </button>
      </div>
    </div>
  );
}

/* ── Saved card ────────────────────────────────────────────────────────────── */

function SavedCard({
  sp, lang, t, copy, copied, onRemove,
}: {
  sp: SavedPost; lang: string; t: (e: string, h: string) => string;
  copy: (k: string, text: string) => void; copied: string | null; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);

  // Fetch the (potentially multi-MB) image only when the card is expanded.
  useEffect(() => {
    if (!open || !sp.has_image || img !== null || imgLoading) return;
    setImgLoading(true);
    fetch(`/api/social/saved/${sp.id}`)
      .then((r) => r.json())
      .then((j) => setImg(typeof j.image === "string" ? j.image : null))
      .catch(() => {})
      .finally(() => setImgLoading(false));
  }, [open, sp.has_image, sp.id, img, imgLoading]);

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
                {sp.metrics.verdict}
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
        <button onClick={onRemove} title={t("Delete", "हटाएँ")}
          className="shrink-0 text-[var(--text-3)] hover:text-[var(--red)] p-1.5">
          <Trash2 size={15} />
        </button>
      </div>

      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
          {sp.metrics && <Scorecard m={sp.metrics} t={t} />}
          <CopyBlock label="X / Twitter" text={sp.pack.x} k={`sx${sp.id}`} copied={copied} onCopy={copy} />
          <CopyBlock label="Instagram" text={sp.pack.instagram} k={`sig${sp.id}`} copied={copied} onCopy={copy} />
          <CopyBlock label="Facebook" text={sp.pack.facebook} k={`sfb${sp.id}`} copied={copied} onCopy={copy} />
          <CopyBlock label={t("YouTube title", "यूट्यूब शीर्षक")} text={sp.pack.youtube_title} k={`syt${sp.id}`} copied={copied} onCopy={copy} />
          <Hashtags tags={sp.pack.hashtags} />
          {sp.has_image && (
            imgLoading && !img ? (
              <div className="text-[11px] text-[var(--text-3)] flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> {t("Loading image…", "इमेज लोड हो रही…")}
              </div>
            ) : img ? (
              <div className="space-y-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="w-full max-w-[320px] rounded-lg border border-[var(--border)]" />
                <a href={img} download={`patrika-social-${sp.id}.png`} className="text-[11px] text-[var(--purple)] hover:underline">
                  {t("Download", "डाउनलोड")}
                </a>
              </div>
            ) : null
          )}
          <CrossCheck corroboration={sp.corroboration ?? []} t={t} />
          {sp.pack.caution && (
            <div className="text-[11.5px] text-[#92400e] bg-[#fef3c7] rounded-lg px-3 py-2 leading-snug">⚠ {sp.pack.caution}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Small shared pieces ───────────────────────────────────────────────────── */

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
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.title.slice(0, 72)}</a>
                ) : (
                  <span>{c.title.slice(0, 72)}</span>
                )}
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
