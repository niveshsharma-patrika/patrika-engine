"use client";

import { useState } from "react";
import { Zap, Loader2, ArrowLeft, RefreshCw, Send, Lightbulb, ChevronRight } from "lucide-react";

import { MAGAZINES } from "@/lib/magazines";
import { useLang } from "@/lib/i18n/context";

type Idea = { headline: string; subVertical: string; hook: string; benefit: string };
type Card = { title: string; text: string };
type QuickByte = { headline: string; cards: Card[] };

const DESKS = MAGAZINES.filter((m) => (m.group ?? "patrika") === "patrika" && m.key !== "custom");

export function QuickBytes() {
  const { lang } = useLang();
  const hi = lang === "hi";

  const [desk, setDesk] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [ideasErr, setIdeasErr] = useState<string | null>(null);

  const [genTopic, setGenTopic] = useState<string | null>(null); // headline being generated
  const [byte, setByte] = useState<QuickByte | null>(null);
  const [byteErr, setByteErr] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [pubMsg, setPubMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function loadIdeas(deskKey: string) {
    setDesk(deskKey);
    setByte(null); setPubMsg(null); setIdeas([]); setIdeasErr(null);
    setLoadingIdeas(true);
    try {
      const r = await fetch("/api/magazine/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ magazine: deskKey, filter: "current" }),
      });
      const j = await r.json();
      if (!r.ok) setIdeasErr(j.error ?? `Failed (${r.status})`);
      else setIdeas(Array.isArray(j.ideas) ? j.ideas : []);
    } catch {
      setIdeasErr(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setLoadingIdeas(false);
    }
  }

  async function generate(topic: string) {
    if (!desk || genTopic) return;
    setGenTopic(topic); setByte(null); setByteErr(null); setPubMsg(null);
    try {
      const r = await fetch("/api/quick-bytes/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ magazine: desk, topic }),
      });
      const j = await r.json();
      if (!r.ok) setByteErr(j.error ?? `Failed (${r.status})`);
      else setByte({ headline: j.headline, cards: j.cards });
    } catch {
      setByteErr(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setGenTopic(null);
    }
  }

  async function publish() {
    if (!byte || !desk || publishing) return;
    setPublishing(true); setPubMsg(null);
    try {
      const r = await fetch("/api/quick-bytes/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ magazine: desk, headline: byte.headline, cards: byte.cards }),
      });
      const j = await r.json();
      if (!r.ok) setPubMsg({ ok: false, text: j.error ?? `Failed (${r.status})` });
      else setPubMsg({ ok: true, text: hi ? "WordPress पर प्रकाशित हो गया।" : "Published to WordPress." });
    } catch {
      setPubMsg({ ok: false, text: hi ? "नेटवर्क त्रुटि" : "Network error" });
    } finally {
      setPublishing(false);
    }
  }

  const deskName = (k: string | null) => {
    const m = DESKS.find((d) => d.key === k);
    return m ? (hi ? m.nameHi : m.nameEn) : "";
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-2.5 mb-1">
        <Zap size={20} className="text-[var(--purple)]" />
        <h1 className="text-[20px] font-semibold text-[var(--text)]">Quick Bytes <span className="text-[var(--text-3)] font-normal">{hi ? "क्विक बाइट्स" : ""}</span></h1>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi
          ? "पत्रिका+ श्रेणी चुनें, करेंट अफेयर्स के आइडिया देखें, और किसी एक को एक-झलक स्वाइप स्टोरी (हेडलाइन + 3–5 कार्ड) में बदलें।"
          : "Pick a Patrika+ category, browse current-affairs ideas, and turn one into a glanceable swipe story (headline + 3–5 cards)."}
      </p>

      {/* Stage 1 — pick a desk */}
      <div className="flex flex-wrap gap-2 mb-5">
        {DESKS.map((m) => (
          <button
            key={m.key}
            onClick={() => loadIdeas(m.key)}
            className={`text-[13px] px-3 py-1.5 rounded-full border transition ${
              desk === m.key
                ? "text-white border-transparent"
                : "border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-2)]"
            }`}
            style={desk === m.key ? { background: "var(--purple)" } : undefined}
          >
            {hi ? m.nameHi : m.nameEn}
          </button>
        ))}
      </div>

      {/* Stage 2 — ideas for the desk */}
      {desk && !byte && (
        <div className="mb-2">
          {loadingIdeas ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-8"><Loader2 size={16} className="animate-spin" /> {hi ? "आइडिया लोड हो रहे हैं…" : "Loading ideas…"}</div>
          ) : ideasErr ? (
            <div className="text-[13px] text-[var(--red)] py-2">{ideasErr}</div>
          ) : ideas.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[12px] font-medium text-[var(--text-2)]">{hi ? `“${deskName(desk)}” के करेंट-अफेयर्स आइडिया — किसी एक को चुनें` : `Current-affairs ideas for “${deskName(desk)}” — pick one`}</div>
                <button onClick={() => loadIdeas(desk)} className="flex items-center gap-1 text-[12px] text-[var(--purple)] hover:underline"><RefreshCw size={12} /> {hi ? "नए आइडिया" : "New ideas"}</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ideas.map((idea, i) => {
                  const busy = genTopic === idea.headline;
                  return (
                    <button
                      key={i}
                      onClick={() => generate(idea.headline)}
                      disabled={!!genTopic}
                      className="text-left bg-white border border-[var(--border)] rounded-lg p-3 hover:border-[var(--purple)] disabled:opacity-60 transition group"
                    >
                      <div className="flex items-start gap-2">
                        <Lightbulb size={14} className="text-[var(--amber)] mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-medium text-[var(--text)]">{idea.headline}</div>
                          {idea.hook && <div className="text-[12px] text-[var(--text-3)] mt-0.5">{idea.hook}</div>}
                        </div>
                        <span className="ml-auto shrink-0 self-center text-[var(--text-3)] group-hover:text-[var(--purple)]">
                          {busy ? <Loader2 size={15} className="animate-spin" /> : <ChevronRight size={15} />}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-[13px] text-[var(--text-3)] py-6">{hi ? "कोई आइडिया नहीं मिला — दोबारा कोशिश करें।" : "No ideas — try again."}</div>
          )}
          {byteErr && <div className="text-[13px] text-[var(--red)] mt-3">{byteErr}</div>}
        </div>
      )}

      {/* Stage 3 — the Quick Byte preview */}
      {byte && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => { setByte(null); setPubMsg(null); }} className="flex items-center gap-1 text-[13px] text-[var(--text-2)] hover:text-[var(--text)]"><ArrowLeft size={15} /> {hi ? "आइडिया पर वापस" : "Back to ideas"}</button>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => byte && genTopic === null && generate(byte.headline)} disabled={!!genTopic}
                className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                {genTopic ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {hi ? "फिर से बनाएँ" : "Regenerate"}
              </button>
              <button onClick={publish} disabled={publishing}
                className="flex items-center gap-1.5 text-[13px] px-3.5 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: "var(--purple)" }}>
                {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {hi ? "WordPress पर प्रकाशित करें" : "Publish to WordPress"}
              </button>
            </div>
          </div>
          {pubMsg && <div className={`mb-3 text-[12px] ${pubMsg.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{pubMsg.text}</div>}

          {/* Swipe-story preview: cover + cards */}
          <div className="flex gap-3 overflow-x-auto pb-3">
            {/* Cover */}
            <div className="shrink-0 w-[300px] rounded-2xl p-5 flex flex-col justify-between text-white" style={{ background: "linear-gradient(160deg, #0f766e, #134e4a)", minHeight: 400 }}>
              <div>
                <div className="text-[11px] font-medium opacity-90 mb-3">{hi ? "आपके लिए महत्वपूर्ण" : "Important for you"}</div>
                <h2 className="text-[24px] font-bold leading-tight">{byte.headline}</h2>
              </div>
              <div className="text-[12px] opacity-80">{hi ? "स्वाइप करें और पढ़ें →" : "Swipe to read →"}</div>
            </div>
            {/* Content cards */}
            {byte.cards.map((c, i) => (
              <div key={i} className="shrink-0 w-[300px] bg-white border border-[var(--border)] rounded-2xl p-5" style={{ minHeight: 400 }}>
                <div className="text-[10px] text-[var(--text-3)] mb-2">{i + 1}/{byte.cards.length}</div>
                <h3 className="text-[17px] font-semibold text-[var(--text)] mb-2.5 leading-snug">{c.title}</h3>
                <p className="text-[14px] text-[var(--text-2)] leading-relaxed whitespace-pre-line">{c.text}</p>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-[var(--text-3)]">{hi ? `डेस्क: ${deskName(desk)} · ${byte.cards.length} कार्ड` : `Desk: ${deskName(desk)} · ${byte.cards.length} cards`}</div>
        </div>
      )}
    </div>
  );
}
