"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Sparkles, Flame, MessageCircle, ArrowUp, ExternalLink,
  Copy, Check, Plus, Trash2, Settings2, AtSign, Globe,
} from "lucide-react";

import { useLang } from "@/lib/i18n/context";

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

type Pack = {
  angle: string; x: string; instagram: string; facebook: string;
  youtube_title: string; hashtags: string[]; image_concept: string; caution: string;
};

type Source = {
  id: string; platform: Platform; query: string; label: string | null;
  is_active: boolean; last_crawled_at: string | null; last_error: string | null; item_count?: number;
};

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

  const [trends, setTrends] = useState<Trend[]>([]);
  const [byPlatform, setByPlatform] = useState<Array<{ platform: string; items: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform | "">("");

  const [openId, setOpenId] = useState<string | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [showSources, setShowSources] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ days: "3" });
      if (platform) q.set("platform", platform);
      const res = await fetch(`/api/social/trends?${q}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setTrends(json.trends ?? []);
      setByPlatform(json.byPlatform ?? []);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [platform]);

  useEffect(() => { load(); }, [load]);

  async function crawl() {
    setCrawling(true); setNote(null); setError(null);
    try {
      const res = await fetch("/api/social/trends/crawl", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "Failed");
      setNote(t(
        `${json.sources_ok}/${json.sources} sources · ${json.items_upserted} new items`,
        `${json.sources} में से ${json.sources_ok} स्रोत · ${json.items_upserted} नए`
      ));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Crawl failed"); }
    finally { setCrawling(false); }
  }

  async function generate(id: string) {
    setGenBusy(id); setError(null);
    try {
      const res = await fetch(`/api/social/trends/${id}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error ?? "Failed");
      setPack(json.pack);
      setOpenId(id);
      setTrends((prev) => prev.map((tr) => (tr.id === id ? { ...tr, has_creative: true } : tr)));
    } catch (e) { setError(e instanceof Error ? e.message : "Generation failed"); }
    finally { setGenBusy(null); }
  }

  function copy(key: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <FilterBtn active={platform === ""} onClick={() => setPlatform("")} label={t("All", "सभी")} />
            <FilterBtn active={platform === "reddit"} onClick={() => setPlatform("reddit")} label="Reddit" />
            <FilterBtn active={platform === "x"} onClick={() => setPlatform("x")} label="X" />
          </div>
          {byPlatform.length > 0 && (
            <span className="text-[11px] text-[var(--text-3)]">
              {byPlatform.map((b) => `${b.items} ${b.platform}`).join(" · ")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSources((s) => !s)}
            className="flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-lg border border-[var(--border)]">
            <Settings2 size={13} /> {t("Sources", "स्रोत")}
          </button>
          <button onClick={crawl} disabled={crawling}
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60"
            style={{ background: "var(--purple)" }}>
            {crawling ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {crawling ? t("Refreshing…", "रिफ़्रेश…") : t("Refresh trends", "ट्रेंड रिफ़्रेश")}
          </button>
        </div>
      </div>

      {note && <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text-2)]">{note}</div>}
      {error && <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[#fee2e2] text-[#991b1b]">{error}</div>}

      {showSources && <SourcesPanel t={t} lang={lang} onChange={load} />}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-10">
          <Loader2 size={15} className="animate-spin" /> {t("Loading…", "लोड हो रहा है…")}
        </div>
      ) : trends.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-xl py-14 text-center text-[13px] text-[var(--text-3)]">
          {t("No trends yet. Press 'Refresh trends' to crawl now.", "अभी कोई ट्रेंड नहीं। 'ट्रेंड रिफ़्रेश' दबाएँ।")}
        </div>
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
                <button onClick={() => (openId === tr.id ? setOpenId(null) : generate(tr.id))}
                  disabled={genBusy !== null}
                  className="shrink-0 self-start flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                  style={{ background: "var(--purple)" }}>
                  {genBusy === tr.id ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {genBusy === tr.id
                    ? t("Writing…", "लिख रहे…")
                    : tr.has_creative
                    ? t("View post", "पोस्ट देखें")
                    : t("Generate post", "पोस्ट बनाएँ")}
                </button>
              </div>

              {openId === tr.id && pack && (
                <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
                  <div className="text-[12px] text-[var(--text-2)]">
                    <span className="font-semibold">{t("Angle", "एंगल")}: </span>{pack.angle}
                  </div>
                  <CopyBlock label="X / Twitter" text={pack.x} k={`x${tr.id}`} copied={copied} onCopy={copy} />
                  <CopyBlock label="Instagram" text={pack.instagram} k={`ig${tr.id}`} copied={copied} onCopy={copy} />
                  <CopyBlock label="Facebook" text={pack.facebook} k={`fb${tr.id}`} copied={copied} onCopy={copy} />
                  <CopyBlock label={t("YouTube title", "यूट्यूब शीर्षक")} text={pack.youtube_title} k={`yt${tr.id}`} copied={copied} onCopy={copy} />
                  {pack.hashtags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {pack.hashtags.map((h, i) => (
                        <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-[var(--border)] text-[var(--text-2)]">
                          {h.startsWith("#") ? h : `#${h}`}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="text-[12px]">
                    <span className="font-semibold">{t("Image concept", "इमेज कॉन्सेप्ट")}: </span>
                    <span className="text-[var(--text-2)]">{pack.image_concept}</span>
                  </div>
                  {pack.caution && (
                    <div className="text-[11.5px] text-[#92400e] bg-[#fef3c7] rounded-lg px-3 py-2 leading-snug">
                      ⚠ {pack.caution}
                    </div>
                  )}
                  <button onClick={() => generate(tr.id)} disabled={genBusy !== null}
                    className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)]">
                    {t("↻ Regenerate", "↻ फिर से बनाएँ")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`text-[12px] px-2.5 py-1.5 rounded-md ${active ? "bg-[var(--text)] text-white font-medium" : "bg-[var(--surface-2)] text-[var(--text-2)]"}`}>
      {label}
    </button>
  );
}

function CopyBlock({
  label, text, k, copied, onCopy,
}: { label: string; text: string; k: string; copied: string | null; onCopy: (k: string, t: string) => void }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)] font-medium">{label}</span>
        <button onClick={() => onCopy(k, text)} className="text-[var(--text-3)] hover:text-[var(--text)]">
          {copied === k ? <Check size={13} className="text-[var(--green)]" /> : <Copy size={13} />}
        </button>
      </div>
      <p className="text-[13px] leading-snug whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function SourcesPanel({ t, lang, onChange }: { t: (e: string, h: string) => string; lang: string; onChange: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [platform, setPlatform] = useState<Platform>("reddit");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/social/trend-sources");
    if (res.ok) setSources((await res.json()).sources ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/social/trend-sources", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, query }),
      });
      if (res.ok) { setQuery(""); await load(); onChange(); }
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    await fetch(`/api/social/trend-sources/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="border border-[var(--border)] rounded-xl bg-white p-4 mb-4">
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}
          className="bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none">
          <option value="reddit">Reddit</option>
          <option value="x">X</option>
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={platform === "reddit" ? t("subreddit e.g. india", "सबरेडिट जैसे india") : t("keyword or #hashtag", "कीवर्ड या #हैशटैग")}
          className="flex-1 min-w-[180px] bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)]" />
        <button onClick={add} disabled={busy || !query.trim()}
          className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-lg text-white disabled:opacity-50" style={{ background: "var(--purple)" }}>
          <Plus size={14} /> {t("Add", "जोड़ें")}
        </button>
      </div>
      {platform === "x" && (
        <p className="text-[11px] text-[var(--text-3)] mb-2">
          {t("X sources need the Twitter cookie set (Admin → Integration keys).", "X स्रोतों के लिए ट्विटर कुकी सेट होनी चाहिए (एडमिन → इंटीग्रेशन कीज़)।")}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-lg bg-[var(--surface-2)]">
            {s.platform === "x" ? <AtSign size={11} /> : <Globe size={11} className="text-[#ff4500]" />}
            {s.label ?? s.query}
            <span className="text-[var(--text-3)]">{s.item_count ?? 0}</span>
            {s.last_error && <span className="text-[#991b1b]" title={s.last_error}>!</span>}
            <button onClick={() => remove(s.id)} className="text-[var(--text-3)] hover:text-[#991b1b]"><Trash2 size={11} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}
