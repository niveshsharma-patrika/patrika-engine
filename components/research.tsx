"use client";

import { useState } from "react";
import { Telescope, Loader2, Search, AlertCircle, Copy, Check, ExternalLink, Sparkles, Clock, Lightbulb, FileText } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Lang = "hi" | "en";
type Source = { title: string; url: string; publisher: string };
type TimelineEntry = { date: string; event: string };
type ResearchResult = {
  summary: string;
  timeline: TimelineEntry[];
  angles: string[];
  unverified: string;
  sources: Source[];
  found: boolean;
};
type Article = { headline: string; body: string };

const LENGTHS: { key: string; en: string; hi: string }[] = [
  { key: "short", en: "Short", hi: "छोटा" },
  { key: "standard", en: "Standard", hi: "मानक" },
  { key: "detailed", en: "Detailed", hi: "विस्तृत" },
];

export function Research() {
  const { lang: uiLang } = useLang();
  const hi = uiLang === "hi";

  const [incident, setIncident] = useState("");
  const [lang, setLang] = useState<Lang>("hi");
  const [research, setResearch] = useState<ResearchResult | null>(null);
  // The incident + language the current research was produced for — so we never
  // write an article from research that no longer matches the edited details.
  const [researchedFor, setResearchedFor] = useState("");
  const [researchedLang, setResearchedLang] = useState<Lang>("hi");
  const [researching, setResearching] = useState(false);
  const [article, setArticle] = useState<Article | null>(null);
  const [writing, setWriting] = useState(false);
  const [angle, setAngle] = useState("");
  const [length, setLength] = useState("standard");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function doResearch() {
    if (incident.trim().length < 10) return;
    setResearching(true); setError(null); setArticle(null); setAngle("");
    try {
      const r = await fetch("/api/research", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ incident: incident.trim(), lang }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Research failed"); setResearch(null); }
      else { setResearch(j as ResearchResult); setResearchedFor(incident.trim()); setResearchedLang(lang); }
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error"); setResearch(null);
    } finally {
      setResearching(false);
    }
  }

  async function doWrite() {
    if (!research) return;
    setWriting(true); setError(null); setArticle(null);
    try {
      const r = await fetch("/api/research/article", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ incident: incident.trim(), lang, angle, length, research }),
      });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "Generation failed");
      else setArticle(j as Article);
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setWriting(false);
    }
  }

  async function copyArticle() {
    if (!article) return;
    try {
      await navigator.clipboard.writeText(`${article.headline}\n\n${article.body}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }

  // Research no longer matches the edited incident/language → block writing from it.
  const stale = !!research && (incident.trim() !== researchedFor || lang !== researchedLang);

  const btn = "text-[13px] font-medium px-4 py-2 rounded flex items-center gap-1.5 disabled:opacity-50";
  const card = "bg-white border border-[var(--border)] rounded-xl p-4";

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2.5 mb-1">
        <Telescope size={20} className="text-[var(--purple)]" />
        <h1 className="text-[20px] font-semibold text-[var(--text)]">{hi ? "रिसर्च" : "Research"}</h1>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi
          ? "किसी घटना का विवरण लिखें — हम उसे ऑनलाइन खोजकर बताते हैं कि क्या मिला, फिर आप उस आधार पर लेख लिखवा सकते हैं।"
          : "Describe an incident — we search the web and show what we found, then you can have an article written from it."}
      </p>

      {/* Incident input */}
      <div className={`${card} mb-4`}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] font-medium text-[var(--text-2)]">{hi ? "घटना का विवरण" : "Incident details"}</label>
          <div className="flex items-center gap-1">
            {(["hi", "en"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)}
                className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${lang === l ? "bg-[var(--purple)] border-[var(--purple)] text-white" : "bg-white border-[var(--border)] text-[var(--text-3)] hover:border-[var(--purple)]"}`}>
                {l === "hi" ? "हिंदी" : "English"}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={incident}
          onChange={(e) => setIncident(e.target.value)}
          rows={6}
          placeholder={hi ? "क्या हुआ, कहाँ, कब, कौन शामिल… जितना विवरण दे सकें दें।" : "What happened, where, when, who was involved… the more detail the better."}
          className="w-full bg-white border border-[var(--border)] text-[13.5px] px-3 py-2 rounded outline-none focus:border-[var(--purple)] resize-y leading-relaxed"
        />
        <div className="flex items-center gap-3 mt-2">
          <button onClick={doResearch} disabled={researching || incident.trim().length < 10}
            className={`${btn} bg-[var(--text)] hover:bg-black text-white`}>
            {researching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {research ? (hi ? "फिर से खोजें" : "Re-search") : (hi ? "खोजें" : "Research")}
          </button>
          {researching && <span className="text-[12px] text-[var(--text-3)]">{hi ? "ऑनलाइन खोज रहे हैं…" : "Searching the web…"}</span>}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[13px] text-[var(--red)] mb-4">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* What we found */}
      {research && !researching && (
        <div className={`${card} mb-4`}>
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} className="text-[var(--purple)]" />
            <h2 className="text-[14px] font-semibold text-[var(--text)]">{hi ? "हमें क्या मिला" : "What we found"}</h2>
          </div>

          {!research.found && (
            <p className="text-[12.5px] text-[var(--amber,#b45309)] bg-[var(--amber-soft,#fef3c7)] px-3 py-2 rounded mb-3">
              {hi ? "इस घटना की पुष्ट ऑनलाइन कवरेज नहीं मिली — आप अपने विवरण के आधार पर लेख लिखवा सकते हैं।" : "No credible online coverage found — you can still write from your own account."}
            </p>
          )}

          {research.summary && (
            <p className="text-[13.5px] text-[var(--text)] leading-relaxed whitespace-pre-wrap mb-3">{research.summary}</p>
          )}

          {research.timeline.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-2)] mb-1.5"><Clock size={13} /> {hi ? "घटनाक्रम" : "Timeline"}</div>
              <ul className="space-y-1">
                {research.timeline.map((t, i) => (
                  <li key={i} className="text-[12.5px] text-[var(--text-1)] flex gap-2">
                    {t.date && <span className="text-[var(--text-3)] shrink-0 font-mono">{t.date}</span>}
                    <span>{t.event}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {research.unverified && (
            <div className="text-[12.5px] text-[var(--amber,#b45309)] bg-[var(--amber-soft,#fef3c7)] px-3 py-2 rounded mb-3">
              <span className="font-medium">{hi ? "असत्यापित / परस्पर विरोधी: " : "Unverified / conflicting: "}</span>{research.unverified}
            </div>
          )}

          {research.sources.length > 0 && (
            <div className="mb-1">
              <div className="text-[12px] font-medium text-[var(--text-2)] mb-1.5">{hi ? "स्रोत" : "Sources"} ({research.sources.length})</div>
              <ul className="space-y-1">
                {research.sources.map((s, i) => (
                  <li key={i} className="text-[12.5px] flex items-start gap-1.5">
                    <ExternalLink size={12} className="text-[var(--text-3)] mt-0.5 shrink-0" />
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[var(--purple)] hover:underline break-words">
                      {s.title}{s.publisher && <span className="text-[var(--text-3)]"> · {s.publisher}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Angles + write controls */}
      {research && !researching && (
        <div className={`${card} mb-4`}>
          {research.angles.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-2)] mb-2"><Lightbulb size={13} /> {hi ? "सुझाए गए एंगल — एक चुनें (वैकल्पिक)" : "Suggested angles — pick one (optional)"}</div>
              <div className="flex flex-wrap gap-2">
                {research.angles.map((a, i) => (
                  <button key={i} onClick={() => setAngle(angle === a ? "" : a)}
                    className={`text-[12px] px-2.5 py-1 rounded-full border text-left transition-colors ${angle === a ? "bg-[var(--purple)] border-[var(--purple)] text-white" : "bg-white border-[var(--border)] text-[var(--text-2)] hover:border-[var(--purple)]"}`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              {LENGTHS.map((l) => (
                <button key={l.key} onClick={() => setLength(l.key)}
                  className={`text-[12px] font-medium px-2.5 py-1 rounded border transition-colors ${length === l.key ? "bg-[var(--surface-2)] border-[var(--purple)] text-[var(--text)]" : "bg-white border-[var(--border)] text-[var(--text-3)] hover:border-[var(--purple)]"}`}>
                  {hi ? l.hi : l.en}
                </button>
              ))}
            </div>
            <button onClick={doWrite} disabled={writing || stale}
              className={`${btn} bg-[var(--purple)] hover:opacity-90 text-white`}>
              {writing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {article ? (hi ? "फिर से लिखें" : "Write again") : (hi ? "लेख लिखें" : "Write article")}
            </button>
            {writing && <span className="text-[12px] text-[var(--text-3)]">{hi ? "लेख लिखा जा रहा है…" : "Writing the article…"}</span>}
            {stale && !writing && (
              <span className="text-[12px] text-[var(--amber,#b45309)]">
                {hi ? "विवरण बदल गया — नए तथ्यों के लिए फिर से खोजें।" : "Details changed — re-search to refresh the findings."}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Article */}
      {article && !writing && (
        <div className={`${card}`}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 className="text-[18px] font-semibold text-[var(--text)] leading-tight">{article.headline || (hi ? "(शीर्षक नहीं)" : "(untitled)")}</h2>
            <button onClick={copyArticle} className={`${btn} bg-white border border-[var(--border)] hover:border-[var(--purple)] shrink-0`}>
              {copied ? <Check size={14} className="text-[var(--green)]" /> : <Copy size={14} />}
              {copied ? (hi ? "कॉपी हो गया" : "Copied") : (hi ? "कॉपी" : "Copy")}
            </button>
          </div>
          <div className="text-[14.5px] text-[var(--text)] leading-relaxed whitespace-pre-wrap">{article.body}</div>
        </div>
      )}
    </div>
  );
}
