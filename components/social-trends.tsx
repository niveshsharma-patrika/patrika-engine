"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Sparkles, Flame, MessageCircle, ArrowUp, ExternalLink,
  Copy, Check, AtSign, Globe,
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
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [corroboration, setCorroboration] = useState<
    { title: string; source: string; url: string; date: string }[]
  >([]);
  const [image, setImage] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/social/trends?days=3`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setTrends(json.trends ?? []);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      setCorroboration(Array.isArray(json.corroboration) ? json.corroboration : []);
      setImage(null);
      setOpenId(id);
      setTrends((prev) => prev.map((tr) => (tr.id === id ? { ...tr, has_creative: true } : tr)));
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

  function copy(key: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  return (
    <>
      <div className="flex items-center justify-end mb-4">
        <button onClick={crawl} disabled={crawling}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg text-white disabled:opacity-60"
          style={{ background: "var(--purple)" }}>
          {crawling ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {crawling ? t("Refreshing…", "रिफ़्रेश…") : t("Refresh", "रिफ़्रेश")}
        </button>
      </div>

      {note && <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text-2)]">{note}</div>}
      {error && <div className="mb-4 text-[12px] px-3 py-2 rounded-lg bg-[#fee2e2] text-[#991b1b]">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-10">
          <Loader2 size={15} className="animate-spin" /> {t("Loading…", "लोड हो रहा है…")}
        </div>
      ) : trends.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-xl py-14 text-center text-[13px] text-[var(--text-3)]">
          {t("No trends yet. Press Refresh to crawl now.", "अभी कोई ट्रेंड नहीं। रिफ़्रेश दबाएँ।")}
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

                  {/* Creative image — render the concept on demand */}
                  <div>
                    {image ? (
                      <div className="space-y-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image} alt="" className="w-full max-w-[320px] rounded-lg border border-[var(--border)]" />
                        <div className="flex gap-3">
                          <a href={image} download={`patrika-social-${tr.id}.png`} className="text-[11px] text-[var(--purple)] hover:underline">
                            {t("Download", "डाउनलोड")}
                          </a>
                          <button onClick={() => genImage(tr.id)} disabled={imgBusy} className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)]">
                            {imgBusy ? t("Generating…", "बना रहे…") : t("↻ Regenerate image", "↻ इमेज फिर बनाएँ")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => genImage(tr.id)} disabled={imgBusy}
                        className="text-[11px] font-medium bg-[var(--text)] hover:bg-black text-white px-3 py-1.5 rounded disabled:opacity-50">
                        {imgBusy ? t("Generating image…", "इमेज बना रहे…") : t("🖼 Generate creative image", "🖼 क्रिएटिव इमेज बनाएँ")}
                      </button>
                    )}
                  </div>

                  {/* News cross-check — is trusted media actually reporting this? */}
                  <div className="text-[11.5px]">
                    {corroboration.length > 0 ? (
                      <div className="bg-[#ecfdf5] border border-[#a7f3d0] rounded-lg px-3 py-2">
                        <div className="font-semibold text-[#065f46] mb-1">
                          {t("✓ Reported by trusted media", "✓ विश्वसनीय मीडिया में मौजूद")}
                        </div>
                        <ul className="space-y-0.5">
                          {corroboration.map((c, i) => (
                            <li key={i} className="text-[var(--text-2)] leading-snug">
                              <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {c.title.slice(0, 72)}
                              </a>
                              <span className="text-[var(--text-3)]"> · {c.source}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="bg-[#fef2f2] border border-[#fecaca] rounded-lg px-3 py-2 text-[#991b1b] leading-snug">
                        {t(
                          "⚠ No trusted news coverage found — likely unverified. Verify before posting.",
                          "⚠ किसी विश्वसनीय समाचार स्रोत में नहीं मिला — असत्यापित हो सकता है। पोस्ट करने से पहले जांचें।"
                        )}
                      </div>
                    )}
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
