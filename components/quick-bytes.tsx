"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Zap, Loader2, ArrowLeft, RefreshCw, Send, Lightbulb, Plus, Trash2,
  Save, ExternalLink, FileText, ChevronRight,
} from "lucide-react";

import { MAGAZINES, MAGAZINE_BY_KEY } from "@/lib/magazines";
import { useLang } from "@/lib/i18n/context";
import { VISUALS, FALLBACK_VISUAL } from "@/components/magazine-visuals";

type Idea = { headline: string; subVertical: string; hook: string; benefit: string };
type Card = { title: string; text: string };
type Saved = { id: string; magazine: string; headline: string; status: string; wpUrl: string | null; cardCount: number; updatedAt: string | null };

const DESKS = MAGAZINES.filter((m) => (m.group ?? "patrika") === "patrika" && m.key !== "custom");

const STATUS_BADGE: Record<string, { cls: string; hi: string; en: string }> = {
  draft:     { cls: "bg-[var(--surface-2)] text-[var(--text-2)]", hi: "ड्राफ्ट", en: "Draft" },
  published: { cls: "bg-[var(--green-soft)] text-[var(--green)]", hi: "प्रकाशित", en: "Published" },
  failed:    { cls: "bg-[var(--red-soft)] text-[var(--red)]", hi: "विफल", en: "Failed" },
};

export function QuickBytes() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const deskName = (k: string) => { const m = MAGAZINE_BY_KEY[k]; return m ? (hi ? m.nameHi : m.nameEn) : k; };

  const [view, setView] = useState<"decks" | "workspace" | "editor" | "saved">("decks");

  // workspace
  const [desk, setDesk] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [ideasErr, setIdeasErr] = useState<string | null>(null);
  const [genTopic, setGenTopic] = useState<string | null>(null);

  // editor
  const [id, setId] = useState<string | null>(null);
  const [magazine, setMagazine] = useState<string>("");
  const [headline, setHeadline] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [status, setStatus] = useState("draft");
  const [wpUrl, setWpUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // saved
  const [saved, setSaved] = useState<Saved[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // ── workspace ──
  function openDesk(k: string) {
    setDesk(k); setFilter(null); setIdeas([]); setIdeasErr(null); setView("workspace");
  }

  async function loadIdeas() {
    if (!desk) return;
    setLoadingIdeas(true); setIdeasErr(null);
    try {
      const r = await fetch("/api/magazine/ideas", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ magazine: desk, filter: filter ?? "current" }),
      });
      const j = await r.json();
      if (!r.ok) setIdeasErr(j.error ?? `Failed (${r.status})`);
      else setIdeas(Array.isArray(j.ideas) ? j.ideas : []);
    } catch { setIdeasErr(hi ? "नेटवर्क त्रुटि" : "Network error"); }
    finally { setLoadingIdeas(false); }
  }

  function openEditor(d: { id: string; magazine: string; headline: string; cards: Card[]; status?: string; wpUrl?: string | null }) {
    setId(d.id); setMagazine(d.magazine); setHeadline(d.headline);
    setCards(d.cards.length ? d.cards : [{ title: "", text: "" }]);
    setStatus(d.status ?? "draft"); setWpUrl(d.wpUrl ?? null); setMsg(null);
    setView("editor");
  }

  async function generate(topic: string) {
    if (!desk || genTopic) return;
    setGenTopic(topic);
    try {
      const r = await fetch("/api/quick-bytes/generate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ magazine: desk, topic }),
      });
      const j = await r.json();
      if (!r.ok) setIdeasErr(j.error ?? `Failed (${r.status})`);
      else openEditor({ id: j.id, magazine: j.magazine, headline: j.headline, cards: j.cards, status: "draft" });
    } catch { setIdeasErr(hi ? "नेटवर्क त्रुटि" : "Network error"); }
    finally { setGenTopic(null); }
  }

  // ── editor ──
  const setCard = (i: number, field: keyof Card, v: string) =>
    setCards((prev) => prev.map((c, k) => (k === i ? { ...c, [field]: v } : c)));
  const addCard = () => setCards((prev) => (prev.length >= 5 ? prev : [...prev, { title: "", text: "" }]));
  const removeCard = (i: number) => setCards((prev) => (prev.length <= 1 ? prev : prev.filter((_, k) => k !== i)));

  const cleanCards = () => cards.map((c) => ({ title: c.title.trim(), text: c.text.trim() })).filter((c) => c.title && c.text);

  async function save() {
    if (!id || saving) return;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(`/api/quick-bytes/${id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ headline: headline.trim(), cards: cleanCards() }),
      });
      const j = await r.json();
      if (!r.ok) setMsg({ ok: false, text: j.error ?? "Failed" });
      else { setMsg({ ok: true, text: hi ? "सेव हो गया।" : "Saved." }); if (status === "published") setStatus("draft"); }
    } catch { setMsg({ ok: false, text: hi ? "नेटवर्क त्रुटि" : "Network error" }); }
    finally { setSaving(false); }
  }

  async function publish() {
    if (!id || publishing) return;
    const cc = cleanCards();
    if (!headline.trim() || cc.length < 3) { setMsg({ ok: false, text: hi ? "हेडलाइन और कम से कम 3 कार्ड चाहिए।" : "Need a headline and at least 3 cards." }); return; }
    setPublishing(true); setMsg(null);
    try {
      const r = await fetch("/api/quick-bytes/publish", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, headline: headline.trim(), cards: cc }),
      });
      const j = await r.json();
      if (!r.ok) {
        // Not-configured leaves the byte a draft; a real error marks it failed.
        if (!j.notConfigured) setStatus("failed");
        setMsg({ ok: false, text: j.error ?? `Failed (${r.status})` });
      } else { setStatus("published"); setWpUrl(j.url ?? null); setMsg({ ok: true, text: hi ? "WordPress पर प्रकाशित हो गया।" : "Published to WordPress." }); }
    } catch { setMsg({ ok: false, text: hi ? "नेटवर्क त्रुटि" : "Network error" }); }
    finally { setPublishing(false); }
  }

  // ── saved ──
  const loadSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const r = await fetch("/api/quick-bytes", { cache: "no-store" });
      if (r.ok) { const j = await r.json(); setSaved(j.bytes ?? []); }
    } catch { /* advisory */ }
    finally { setLoadingSaved(false); }
  }, []);
  useEffect(() => { if (view === "saved") loadSaved(); }, [view, loadSaved]);

  async function openSaved(sid: string) {
    try {
      const r = await fetch(`/api/quick-bytes/${sid}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok && j.byte) openEditor(j.byte);
    } catch { /* ignore */ }
  }
  async function del(sid: string) {
    if (!confirm(hi ? "इस Quick Byte को हटाएँ?" : "Delete this Quick Byte?")) return;
    await fetch(`/api/quick-bytes/${sid}`, { method: "DELETE" });
    loadSaved();
  }

  const header = (
    <div className="flex items-center gap-2.5 mb-1">
      <Zap size={20} className="text-[var(--purple)]" />
      <h1 className="text-[20px] font-semibold text-[var(--text)]">Quick Bytes <span className="text-[var(--text-3)] font-normal">{hi ? "क्विक बाइट्स" : ""}</span></h1>
      <button onClick={() => setView("saved")} className="ml-auto flex items-center gap-1.5 text-[13px] text-[var(--text-2)] hover:text-[var(--text)]">
        <FileText size={15} /> {hi ? "सेव किए गए" : "Saved"}
      </button>
    </div>
  );

  // ── DECKS ──
  if (view === "decks") {
    return (
      <div className="p-6 max-w-6xl">
        {header}
        <p className="text-[13px] text-[var(--text-3)] mb-5">
          {hi ? "कोई श्रेणी चुनें → करेंट-अफेयर्स आइडिया → एक-झलक स्वाइप स्टोरी बनाएँ और प्रकाशित करें।" : "Pick a category → current-affairs ideas → build a glanceable swipe story and publish."}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
          {DESKS.map((m) => {
            const v = VISUALS[m.key] ?? FALLBACK_VISUAL;
            return (
              <button key={m.key} onClick={() => openDesk(m.key)}
                className="text-left bg-white border border-[var(--border)] rounded-lg overflow-hidden hover:border-[var(--purple)] hover:shadow-sm transition-colors">
                <div className="h-14 flex items-center justify-center relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${v.from}, ${v.to})` }}>
                  <v.Icon size={22} strokeWidth={1.5} className="text-white/90" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/magazines/${m.key}.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </div>
                <div className="p-2.5">
                  <div className="text-[13px] font-semibold text-[var(--text)] leading-tight">{m.nameHi}</div>
                  <div className="text-[9px] text-[var(--text-3)] uppercase tracking-wide mb-1">{m.nameEn}</div>
                  <div className="text-[11px] text-[var(--text-2)] leading-snug line-clamp-2">{m.tagline}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── SAVED ──
  if (view === "saved") {
    return (
      <div className="p-6 max-w-4xl">
        <button onClick={() => setView("decks")} className="flex items-center gap-1.5 text-[13px] text-[var(--text-3)] hover:text-[var(--text)] mb-4"><ArrowLeft size={14} /> {hi ? "वापस" : "Back"}</button>
        <h1 className="text-[18px] font-semibold text-[var(--text)] mb-4">{hi ? "सेव किए गए Quick Bytes" : "Saved Quick Bytes"}</h1>
        {loadingSaved ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-8"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
        ) : saved.length === 0 ? (
          <div className="text-[13px] text-[var(--text-3)] py-6">{hi ? "अभी कुछ सेव नहीं है।" : "Nothing saved yet."}</div>
        ) : (
          <div className="bg-white border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
            {saved.map((b) => {
              const badge = STATUS_BADGE[b.status] ?? STATUS_BADGE.draft;
              return (
                <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button onClick={() => openSaved(b.id)} className="flex-1 min-w-0 text-left group">
                    <div className="text-[13.5px] font-medium text-[var(--text)] truncate group-hover:text-[var(--purple)]">{b.headline}</div>
                    <div className="text-[11px] text-[var(--text-3)]">{deskName(b.magazine)} · {b.cardCount} {hi ? "कार्ड" : "cards"}</div>
                  </button>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge.cls}`}>{hi ? badge.hi : badge.en}</span>
                  {b.wpUrl && <a href={b.wpUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-3)] hover:text-[var(--purple)]" title="WordPress"><ExternalLink size={14} /></a>}
                  <button onClick={() => del(b.id)} className="text-[var(--text-3)] hover:text-[var(--red)]" title={hi ? "हटाएँ" : "Delete"}><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── EDITOR ──
  if (view === "editor") {
    const badge = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
    const canPublish = headline.trim() && cleanCards().length >= 3;
    return (
      <div className="p-6 max-w-5xl">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setView(desk ? "workspace" : "saved")} className="flex items-center gap-1.5 text-[13px] text-[var(--text-3)] hover:text-[var(--text)]"><ArrowLeft size={14} /> {hi ? "वापस" : "Back"}</button>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge.cls}`}>{hi ? badge.hi : badge.en}</span>
          {wpUrl && <a href={wpUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] text-[var(--purple)] hover:underline"><ExternalLink size={12} /> {hi ? "WordPress पर देखें" : "View on WordPress"}</a>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {hi ? "सेव" : "Save"}
            </button>
            <button onClick={publish} disabled={publishing || !canPublish} className="flex items-center gap-1.5 text-[13px] px-3.5 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: "var(--purple)" }} title={!canPublish ? (hi ? "हेडलाइन + कम से कम 3 कार्ड" : "Headline + at least 3 cards") : undefined}>
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {hi ? "प्रकाशित करें" : "Publish"}
            </button>
          </div>
        </div>
        {msg && <div className={`mb-3 text-[12px] ${msg.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{msg.text}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Editor */}
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">{hi ? "हेडलाइन" : "Headline"}</label>
            <textarea value={headline} onChange={(e) => setHeadline(e.target.value)} rows={2}
              className="w-full bg-white border border-[var(--border)] text-[15px] font-medium px-3 py-2 rounded-lg outline-none focus:border-[var(--purple)] mb-4 resize-none" />

            {cards.map((c, i) => (
              <div key={i} className="border border-[var(--border)] rounded-lg p-3 mb-2.5 bg-white">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-[var(--text-3)]">{hi ? "कार्ड" : "Card"} {i + 1}</span>
                  {cards.length > 1 && <button onClick={() => removeCard(i)} className="text-[var(--text-3)] hover:text-[var(--red)]"><Trash2 size={13} /></button>}
                </div>
                <input value={c.title} onChange={(e) => setCard(i, "title", e.target.value)} placeholder={hi ? "कार्ड शीर्षक" : "Card title"}
                  className="w-full bg-white border border-[var(--border)] text-[13.5px] font-medium px-2.5 py-1.5 rounded outline-none focus:border-[var(--purple)] mb-1.5" />
                <textarea value={c.text} onChange={(e) => setCard(i, "text", e.target.value)} rows={3} placeholder={hi ? "कार्ड टेक्स्ट" : "Card text"}
                  className="w-full bg-white border border-[var(--border)] text-[13px] px-2.5 py-1.5 rounded outline-none focus:border-[var(--purple)] resize-none" />
              </div>
            ))}
            {cards.length < 5 && (
              <button onClick={addCard} className="flex items-center gap-1.5 text-[12px] text-[var(--purple)] hover:underline mt-1"><Plus size={13} /> {hi ? "कार्ड जोड़ें" : "Add card"}</button>
            )}
            <div className="text-[11px] text-[var(--text-3)] mt-2">{hi ? "3–5 कार्ड" : "3–5 cards"} · {deskName(magazine)}</div>
          </div>

          {/* Live swipe preview */}
          <div className="lg:sticky lg:top-4 self-start">
            <div className="text-[11px] text-[var(--text-3)] mb-2">{hi ? "झलक" : "Preview"}</div>
            <div className="flex gap-2.5 overflow-x-auto pb-3">
              <div className="shrink-0 w-[240px] rounded-2xl p-4 flex flex-col justify-between text-white" style={{ background: "linear-gradient(160deg, #0f766e, #134e4a)", minHeight: 320 }}>
                <div>
                  <div className="text-[10px] font-medium opacity-90 mb-2">{hi ? "आपके लिए महत्वपूर्ण" : "Important for you"}</div>
                  <h2 className="text-[19px] font-bold leading-tight">{headline || (hi ? "हेडलाइन…" : "Headline…")}</h2>
                </div>
                <div className="text-[11px] opacity-80">{hi ? "स्वाइप करें →" : "Swipe →"}</div>
              </div>
              {cleanCards().map((c, i) => (
                <div key={i} className="shrink-0 w-[240px] bg-white border border-[var(--border)] rounded-2xl p-4" style={{ minHeight: 320 }}>
                  <div className="text-[10px] text-[var(--text-3)] mb-1.5">{i + 1}</div>
                  <h3 className="text-[15px] font-semibold text-[var(--text)] mb-2 leading-snug">{c.title}</h3>
                  <p className="text-[13px] text-[var(--text-2)] leading-relaxed whitespace-pre-line">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── WORKSPACE (ideas) ──
  const mag = desk ? MAGAZINE_BY_KEY[desk] : null;
  return (
    <div className="p-6 max-w-5xl">
      <button onClick={() => setView("decks")} className="flex items-center gap-1.5 text-[13px] text-[var(--text-3)] hover:text-[var(--text)] mb-4"><ArrowLeft size={14} /> {hi ? "वापस" : "Back"}</button>
      {mag && (
        <div className="pb-4 mb-5 border-b border-[var(--border)]">
          <h1 className="text-[20px] font-medium">{mag.nameHi} <span className="text-[13px] text-[var(--text-3)] font-normal">· {mag.nameEn}</span></h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1">{mag.tagline}</p>
        </div>
      )}

      {/* angle filters */}
      {mag && (mag.filters?.length || true) && (
        <div className="mb-4">
          <div className="text-[11px] text-[var(--text-3)] mb-1.5">{hi ? "एंगल चुनें (वैकल्पिक)" : "Choose an angle (optional)"}</div>
          <div className="flex flex-wrap gap-1.5">
            {(mag.filters ?? []).map((f) => {
              const active = filter === f.key;
              return (
                <button key={f.key} onClick={() => setFilter(active ? null : f.key)} title={f.brief}
                  className={`text-[12px] px-3 py-1.5 rounded-full border transition-colors ${active ? "border-[var(--purple)] bg-[var(--red-soft)] text-[var(--text)] font-medium" : "border-[var(--border)] text-[var(--text-2)] hover:border-[var(--text-3)]"}`}>
                  {f.label}
                </button>
              );
            })}
            <button onClick={() => setFilter(filter === "explainer" ? null : "explainer")}
              className={`text-[12px] px-3 py-1.5 rounded-full border transition-colors ${filter === "explainer" ? "border-[var(--purple)] bg-[var(--red-soft)] text-[var(--text)] font-medium" : "border-dashed border-[var(--border)] text-[var(--text-2)] hover:border-[var(--purple)]"}`}>
              {hi ? "🔥 एक्सप्लेनर (ट्रेंडिंग)" : "🔥 Explainer (trending)"}
            </button>
          </div>
        </div>
      )}

      <button onClick={loadIdeas} disabled={loadingIdeas}
        className="flex items-center gap-1.5 text-white text-[13px] font-medium px-4 py-2 rounded-lg disabled:opacity-50 mb-4" style={{ background: "var(--purple)" }}>
        {loadingIdeas ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />} {ideas.length ? (hi ? "नए आइडिया" : "New ideas") : (hi ? "आइडिया जनरेट करें" : "Generate ideas")}
      </button>

      {ideasErr && <div className="text-[13px] text-[var(--red)] mb-3">{ideasErr}</div>}

      {ideas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ideas.map((idea, i) => {
            const busy = genTopic === idea.headline;
            return (
              <button key={i} onClick={() => generate(idea.headline)} disabled={!!genTopic}
                className="text-left bg-white border border-[var(--border)] rounded-lg p-3 hover:border-[var(--purple)] disabled:opacity-60 transition group">
                <div className="flex items-start gap-2">
                  <Lightbulb size={14} className="text-[var(--amber)] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-[var(--text)]">{idea.headline}</div>
                    {idea.hook && <div className="text-[12px] text-[var(--text-3)] mt-0.5">{idea.hook}</div>}
                  </div>
                  <span className="ml-auto shrink-0 self-center text-[var(--text-3)] group-hover:text-[var(--purple)]">{busy ? <Loader2 size={15} className="animate-spin" /> : <ChevronRight size={15} />}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
