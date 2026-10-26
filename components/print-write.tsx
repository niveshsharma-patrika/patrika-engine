"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Save, Check, AlertCircle, ExternalLink, Download, Send, MapPin, Plus } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { LENGTHS, downloadStoryTxt, statusLabel } from "@/lib/print/ui";

type Source = { title: string; url: string; publisher: string };
type City = { key: string; name_en: string; name_hi: string; region: string };
type LengthKey = (typeof LENGTHS)[number]["key"];

const wc = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const MIN_BRIEF = 10; // /api/research rejects shorter incidents

/** What the composer opens with (from the URL, read on the server). */
export type WriteInitial = { draftId: string; title: string; summary: string; url: string; city: string };

/** The print composer: brief → web research → grounded story at a print length
 *  (headline + deck + body, house-style directive applied) → edit → save /
 *  submit to desk / export .txt. Reopens an existing draft via ?draftId=. */
export function PrintWrite({ initial }: { initial: WriteInitial }) {
  const { lang } = useLang();
  const hi = lang === "hi";
  const router = useRouter();

  const [cities, setCities] = useState<City[]>([]);
  const [city, setCity] = useState(initial.city);
  const [topic, setTopic] = useState(initial.title ? (initial.summary ? `${initial.title}\n\n${initial.summary}` : initial.title) : "");
  const [sourceUrl, setSourceUrl] = useState(initial.url);
  const fromStory = Boolean(initial.title && (initial.summary || initial.url));
  const [length, setLength] = useState<LengthKey>("standard");
  const [phase, setPhase] = useState<"idle" | "researching" | "writing">("idle");
  const [done, setDone] = useState(false);
  const [headline, setHeadline] = useState("");
  const [deck, setDeck] = useState("");
  const [body, setBody] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(initial.draftId));
  const [mine, setMine] = useState(true);
  const runRef = useRef(0);

  useEffect(() => {
    fetch("/api/print/cities", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCities(Array.isArray(j) ? j : j.cities ?? []))
      .catch(() => { /* advisory */ });
  }, []);

  // Reopen a saved draft (?draftId=). A fresh story is prefilled from the
  // initial props instead (title/summary/url/city from a "Write" click).
  useEffect(() => {
    const id = initial.draftId;
    if (!id) return;
    let alive = true;
    fetch(`/api/print/drafts/${encodeURIComponent(id)}`, { cache: "no-store" })
        .then(async (r) => {
          const j = await r.json();
          if (!alive) return;
          if (!r.ok) { setError(j.error ?? "Draft not found"); return; }
          const d = j.draft;
          setDraftId(d.id); setStatus(d.status); setMine(d.mine !== false);
          setHeadline(d.title ?? ""); setBody(d.body ?? ""); setCity(d.city ?? "");
          const meta = (d.generation_metadata ?? {}) as Record<string, unknown>;
          setDeck(typeof meta.deck === "string" ? meta.deck : "");
          setTopic(typeof meta.brief === "string" ? meta.brief : d.title ?? "");
          if (typeof meta.sourceUrl === "string") setSourceUrl(meta.sourceUrl);
          if (Array.isArray(meta.sources)) setSources(meta.sources as Source[]);
          if (typeof meta.length === "string" && LENGTHS.some((l) => l.key === meta.length)) setLength(meta.length as LengthKey);
          setDone(true);
        })
        .catch(() => { if (alive) setError(hi ? "नेटवर्क त्रुटि" : "Network error"); })
        .finally(() => { if (alive) setLoadingDraft(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = phase !== "idle";
  const preset = LENGTHS.find((l) => l.key === length) ?? LENGTHS[1];
  const cityObj = cities.find((c) => c.key === city);
  // Frozen once the desk approves it; another writer's story is read-only here
  // (editors review it on the Desk).
  const locked = status === "approved" || status === "published" || !mine;

  async function generate() {
    if (topic.trim().length < MIN_BRIEF || busy) return;
    const run = ++runRef.current;
    setError(null); setDone(false); setSources([]);
    const place = cityObj ? `\n\nPlace: ${cityObj.name_en} (${cityObj.name_hi})` : "";
    const incident = topic.trim() + place + (sourceUrl ? `\n\nSource: ${sourceUrl}` : "");
    const payload = { lang: hi ? "hi" : "en" };
    try {
      setPhase("researching");
      const rr = await fetch("/api/research", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ incident, ...payload }),
      });
      const research = await rr.json();
      if (run !== runRef.current) return;
      if (!rr.ok) { setError(research.error ?? "Research failed"); return; }
      setSources(Array.isArray(research.sources) ? research.sources : []);

      setPhase("writing");
      const ar = await fetch("/api/research/article", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ incident, research, words: preset.words, print: true, ...payload }),
      });
      const art = await ar.json();
      if (run !== runRef.current) return;
      if (!ar.ok) { setError(art.error ?? "Writing failed"); return; }
      setHeadline((art.headline ?? "").trim());
      setDeck((art.deck ?? "").trim());
      setBody((art.body ?? "").trim());
      setDone(true);
    } catch {
      if (run === runRef.current) setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      if (run === runRef.current) setPhase("idle");
    }
  }

  async function save(next: "in_progress" | "awaiting_review") {
    if (!headline.trim() || saving || locked) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/drafts/save", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draftId, title: headline.trim(), body, status: next, surface: "print",
          city: city || null, desk: cityObj ? `Local · ${cityObj.name_en}` : "Print",
          meta: { deck, brief: topic, sourceUrl: sourceUrl || undefined, sources: sources.slice(0, 12), length, words: wc(body) },
        }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Save failed"); return; }
      setDraftId(j.id); setStatus(j.status); setSavedAt(Date.now());
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-[var(--red)] disabled:bg-[var(--surface-2)]";
  const words = wc(body);
  const raj = cities.filter((c) => c.region === "rajasthan");
  const metro = cities.filter((c) => c.region !== "rajasthan");

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[22px] font-medium">{draftId ? (hi ? "स्टोरी एडिट करें" : "Edit story") : (hi ? "स्टोरी लिखें" : "Write a story")}</h1>
        <div className="flex items-center gap-2">
          {status && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-2)]">{statusLabel(status, hi)}</span>}
          {(draftId || done) && (
            <button onClick={() => router.push(`/print/write?new=${Date.now()}`)}
              className="inline-flex items-center gap-1 text-[12px] font-medium border border-[var(--border)] hover:border-[var(--red)] rounded px-2.5 py-1">
              <Plus size={13} /> {hi ? "नई स्टोरी" : "New story"}
            </button>
          )}
        </div>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi ? "विषय या घटना लिखें, शहर और लंबाई चुनें — हम ऑनलाइन रिसर्च करके प्रिंट के लिए हेडलाइन, डेक और बॉडी तैयार करते हैं। एडिट करें, डेस्क को भेजें या .txt निकालें।" : "Enter a topic or incident, pick the city and length — we research online and write a print-ready headline, deck and body. Edit, submit to the desk, or export as .txt."}
      </p>

      {loadingDraft ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "ड्राफ़्ट लोड हो रहा है…" : "Loading draft…"}</div>
      ) : (
        <>
          <div className="bg-white border border-[var(--border)] rounded-xl p-4 mb-4">
            <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1.5">
              {fromStory ? (hi ? "स्टोरी ब्रीफ़ (एडिट कर सकते हैं)" : "Story brief (editable)") : (hi ? "विषय / ब्रीफ़" : "Topic / brief")}
            </label>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={fromStory ? 4 : 2} maxLength={2000} disabled={locked}
              placeholder={hi ? "जैसे: जयपुर में जलभराव की समस्या और नगर निगम की तैयारी" : "e.g. Jaipur's waterlogging problem and what the municipal body is doing"}
              className={`${field} resize-y`} />
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text-3)] hover:text-[var(--red)] mt-1.5">
                <ExternalLink size={11} /> {hi ? "मूल स्रोत" : "source story"}
              </a>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-3">
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-2)]">
                <MapPin size={13} />
                <select value={city} onChange={(e) => setCity(e.target.value)} disabled={locked} className="border border-[var(--border)] rounded px-2 py-1.5 text-[13px] bg-white outline-none focus:border-[var(--red)] min-w-[170px]">
                  <option value="">{hi ? "शहर — राष्ट्रीय / कोई नहीं" : "City — national / none"}</option>
                  {raj.length > 0 && <optgroup label={hi ? "राजस्थान" : "Rajasthan"}>{raj.map((c) => <option key={c.key} value={c.key}>{hi ? c.name_hi : c.name_en}</option>)}</optgroup>}
                  {metro.length > 0 && <optgroup label={hi ? "बड़े शहर" : "Metros"}>{metro.map((c) => <option key={c.key} value={c.key}>{hi ? c.name_hi : c.name_en}</option>)}</optgroup>}
                </select>
              </label>
              <div className="flex items-center gap-1">
                {LENGTHS.map((l) => (
                  <button key={l.key} onClick={() => setLength(l.key)} disabled={locked}
                    className={`px-2.5 py-1 rounded-full text-[12px] border ${length === l.key ? "bg-[var(--red)] text-white border-[var(--red)]" : "bg-white border-[var(--border)] text-[var(--text-2)] hover:border-[var(--red)]"}`}>
                    {hi ? l.hi : l.en}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <button onClick={generate} disabled={busy || locked || topic.trim().length < MIN_BRIEF}
                className="bg-[var(--red)] hover:bg-[var(--red-hover)] disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded flex items-center gap-1.5">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {phase === "researching" ? (hi ? "रिसर्च हो रही है…" : "Researching…") : phase === "writing" ? (hi ? "लेख लिखा जा रहा है…" : "Writing…") : done ? (hi ? "फिर से बनाएँ" : "Regenerate") : (hi ? "रिसर्च कर लिखें" : "Research & write")}
              </button>
              {busy && <span className="text-[11.5px] text-[var(--text-3)]">{hi ? "इसमें एक मिनट तक लग सकता है।" : "This can take up to a minute."}</span>}
              {locked && (
                <span className="text-[11.5px] text-[var(--text-3)]">
                  {!mine ? (hi ? "दूसरे लेखक की स्टोरी — इसे डेस्क पर रिव्यू करें।" : "Another writer's story — review it on the Desk.") : (hi ? "स्वीकृत स्टोरी — अब एडिट नहीं हो सकती।" : "Approved story — no further edits.")}
                </span>
              )}
            </div>
          </div>

          {error && <div className="flex items-center gap-2 text-[13px] text-[var(--red)] mb-4"><AlertCircle size={15} /> {error}</div>}

          {done && (
            <div className="bg-white border border-[var(--border)] rounded-xl p-4">
              <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1.5">{hi ? "हेडलाइन" : "Headline"}</label>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} disabled={locked} className={`${field} mb-3 font-medium text-[15px]`} />
              <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1.5">{hi ? "डेक / उप-शीर्षक" : "Deck / subhead"}</label>
              <input value={deck} onChange={(e) => setDeck(e.target.value)} disabled={locked} className={`${field} mb-3`} placeholder={hi ? "एक पंक्ति का उप-शीर्षक" : "One-line subhead"} />
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-medium text-[var(--text-2)]">{hi ? "बॉडी" : "Body"}</label>
                <span className={`text-[11px] ${Math.abs(words - preset.words) > preset.words * 0.3 ? "text-[var(--amber,#b45309)]" : "text-[var(--text-3)]"}`}>
                  {words} {hi ? "शब्द" : "words"} · {hi ? "लक्ष्य" : "target"} ~{preset.words}
                </span>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} rows={18} className={`${field} leading-relaxed`} />

              {sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="text-[11px] font-medium text-[var(--text-3)] mb-1.5">{hi ? "स्रोत" : "Sources"} ({sources.length})</div>
                  <ul className="space-y-1">
                    {sources.slice(0, 8).map((s, i) => (
                      <li key={i} className="text-[11.5px] flex items-start gap-1.5">
                        <ExternalLink size={11} className="text-[var(--text-3)] mt-0.5 shrink-0" />
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[var(--red)] hover:underline break-words">{s.title}{s.publisher && <span className="text-[var(--text-3)]"> · {s.publisher}</span>}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2.5 mt-4 flex-wrap">
                <button onClick={() => save("in_progress")} disabled={saving || locked || !headline.trim()}
                  className="bg-[var(--text)] hover:bg-black text-white text-[13px] font-medium px-4 py-2 rounded disabled:opacity-50 flex items-center gap-1.5">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {hi ? "ड्राफ़्ट सेव करें" : "Save draft"}
                </button>
                <button onClick={() => save("awaiting_review")} disabled={saving || locked || !headline.trim()}
                  className="bg-white border border-[var(--border)] hover:border-[var(--red)] text-[13px] font-medium px-4 py-2 rounded disabled:opacity-50 flex items-center gap-1.5">
                  <Send size={13} /> {hi ? "डेस्क को भेजें" : "Submit to desk"}
                </button>
                <button onClick={() => downloadStoryTxt(headline, deck, body)} disabled={!headline.trim()}
                  className="bg-white border border-[var(--border)] hover:border-[var(--red)] text-[13px] font-medium px-4 py-2 rounded disabled:opacity-50 flex items-center gap-1.5">
                  <Download size={13} /> .txt
                </button>
                {savedAt && (
                  <span className="text-[12px] text-[var(--green)] inline-flex items-center gap-1">
                    <Check size={13} /> {status === "awaiting_review" ? (hi ? "डेस्क को भेजा गया" : "Sent to desk") : (hi ? "सेव हो गया" : "Saved")} ·{" "}
                    <Link href="/print/drafts" className="text-[var(--red)] hover:underline">{hi ? "मेरे ड्राफ़्ट" : "My Drafts"}</Link>
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
