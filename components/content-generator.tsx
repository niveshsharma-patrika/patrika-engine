"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Wand2, Copy, Check, ExternalLink, ShieldCheck } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type SourceArticle = { title: string; publisher: string; url: string; date: string };
type Result = {
  titles: string[];
  description: string;
  title: string;
  body: string;
  sources: number;
  sourceArticles: SourceArticle[];
};

export function ContentGenerator() {
  const { lang } = useLang();
  const t = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // The pipeline runs ~1–3 min (live research → fact-check → write → language
  // polish). Rotate a status line so the wait reads as progress, not a hang.
  const steps = [
    t("Researching sources…", "स्रोतों पर शोध…"),
    t("Cross-checking facts…", "तथ्यों की जाँच…"),
    t("Writing the article…", "लेख लिखा जा रहा है…"),
    t("Correcting the language…", "भाषा सुधार…"),
    t("Finishing up…", "अंतिम रूप…"),
  ];
  useEffect(() => {
    if (!busy) { setStep(0); return; }
    const id = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 9000);
    return () => clearInterval(id);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    const topic = text.trim();
    if (!topic || busy) return;
    setBusy(true); setError(null); setResult(null);
    // Follow the pasted script: Devanagari → Hindi article; else the app language.
    const useHi = /[ऀ-ॿ]/.test(topic) || lang === "hi";
    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trendId: null, title: topic, mode: "factual", lang: useHi ? "hi" : "en" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      setResult(json as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  function copy(key: string, str: string) {
    navigator.clipboard?.writeText(str);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  const headlines = result ? result.titles.filter((h) => h && h.trim() && h.trim() !== result.title.trim()) : [];
  const rawTitle = (result?.title ?? "").trim();
  // If headline generation degraded to just the topic, don't dump the whole
  // pasted blob as the H2 — show it only when it reads like a headline, else a
  // trimmed first line.
  const shortTitle = rawTitle.length <= 120 && !rawTitle.includes("\n")
    ? rawTitle
    : rawTitle.split("\n")[0].slice(0, 100).trim() + "…";
  const primary = headlines[0] ?? shortTitle;
  const alts = headlines.slice(1);
  const fullCopy = result
    ? [headlines[0] ?? "", result.description, "", result.body].filter(Boolean).join("\n\n")
    : "";

  return (
    <div className="max-w-[820px]">
      <h1 className="text-[22px] font-semibold flex items-center gap-2 mb-1">
        <Wand2 size={20} className="text-[var(--purple)]" />
        {t("Content Generator", "कंटेंट जनरेटर")}
      </h1>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {t("Paste a headline or some text. Patrika's full pipeline — live research, fact-check and language correction — writes the article.",
           "एक हेडलाइन या कुछ टेक्स्ट डालें। पत्रिका की पूरी प्रक्रिया — लाइव शोध, तथ्य-जाँच और भाषा सुधार — लेख तैयार करती है।")}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate(); }}
        disabled={busy}
        maxLength={6000}
        rows={6}
        placeholder={t("Paste a headline and any notes or source text…  (⌘/Ctrl + Enter to generate)",
                       "एक हेडलाइन और कोई नोट्स या स्रोत-टेक्स्ट डालें…  (⌘/Ctrl + Enter से बनाएँ)")}
        className="w-full bg-white border border-[var(--border)] rounded-xl text-[14px] leading-relaxed px-4 py-3 outline-none focus:border-[var(--purple)] disabled:opacity-60 resize-y min-h-[150px]"
      />

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={generate}
          disabled={busy || !text.trim()}
          className="flex items-center gap-2 text-[13px] font-medium px-4 py-2.5 rounded-lg text-white disabled:opacity-50"
          style={{ background: "var(--purple)" }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          {busy ? t("Generating…", "बना रहे…") : t("Generate article", "लेख बनाएँ")}
        </button>
        {busy && <span className="text-[12px] text-[var(--text-3)]">{steps[step]}</span>}
        {!busy && !result && (
          <span className="text-[12px] text-[var(--text-3)]">{t("Takes about 1–3 minutes.", "लगभग 1–3 मिनट लगते हैं।")}</span>
        )}
        {text.length > 2000 && (
          <span className="ml-auto text-[11px] tabular-nums text-[var(--text-3)]" style={{ color: text.length > 5400 ? "#d97706" : undefined }}>
            {text.length}/6000
          </span>
        )}
      </div>

      {error && <div className="mt-4 text-[12px] px-3 py-2 rounded-lg bg-[#fee2e2] text-[#991b1b]">{error}</div>}

      {result && (
        <div className="mt-7 border-t border-[var(--border)] pt-6">
          {/* Headline + actions */}
          <div className="flex items-start justify-between gap-4 mb-1">
            <h2 className="text-[22px] font-bold leading-tight text-[var(--text)]">{primary}</h2>
            <button onClick={() => copy("all", fullCopy)}
              className="shrink-0 flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]">
              {copied === "all" ? <Check size={13} className="text-[var(--green)]" /> : <Copy size={13} />}
              {copied === "all" ? t("Copied", "कॉपी हो गया") : t("Copy all", "सब कॉपी")}
            </button>
          </div>
          {result.description && <p className="text-[14px] text-[var(--text-2)] italic mb-4">{result.description}</p>}

          {/* Body */}
          <article className="text-[15px] leading-[1.75] text-[var(--text)] space-y-3.5">
            {renderArticle(result.body)}
          </article>

          {/* Alternate headlines */}
          {alts.length > 0 && (
            <div className="mt-6 border-t border-[var(--border)] pt-4">
              <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-3)] font-semibold mb-2">
                {t("Other headline options", "अन्य हेडलाइन विकल्प")}
              </h3>
              <ul className="space-y-1.5 list-none">
                {alts.map((h, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 text-[13.5px] text-[var(--text-2)]">
                    <span>{h}</span>
                    <button onClick={() => copy(`h${i}`, h)} className="shrink-0 text-[var(--text-3)] hover:text-[var(--text)]">
                      {copied === `h${i}` ? <Check size={13} className="text-[var(--green)]" /> : <Copy size={13} />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sources — evidence the research + fact-check ran */}
          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-3)] font-semibold mb-2 flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-[var(--green)]" />
              {result.sourceArticles.length > 0
                ? t(`Researched from ${result.sourceArticles.length} trusted sources`, `${result.sourceArticles.length} विश्वसनीय स्रोतों से शोध`)
                : t("Written from live web research", "लाइव वेब शोध से लिखा गया")}
            </h3>
            {result.sourceArticles.length > 0 && (
              <ul className="space-y-1 list-none">
                {result.sourceArticles.map((s, i) => (
                  <li key={i} className="text-[12.5px] text-[var(--text-2)] leading-snug">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
                      {s.title.slice(0, 90)} <ExternalLink size={10} className="shrink-0" />
                    </a>
                    <span className="text-[var(--text-3)]"> · {s.publisher}{s.date ? ` · ${s.date}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Render the plain-text article: blank-line paragraphs, with short headingless
 * lines (and markdown ## / **bold** lines) promoted to subheadings. */
function renderArticle(body: string): React.ReactNode {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block, i) => {
    const md = block.match(/^#{1,4}\s+(.*)$/);
    const boldOnly = block.match(/^\*\*(.+)\*\*$/);
    const single = !block.includes("\n");
    const looksHeading =
      single && block.length <= 70 && !/[।.!?:;]$/.test(block) && !block.startsWith("•") && !block.startsWith("-");
    if (md || boldOnly || looksHeading) {
      const text = (md?.[1] ?? boldOnly?.[1] ?? block).trim();
      return <h3 key={i} className="text-[16px] font-semibold text-[var(--text)] pt-2">{text}</h3>;
    }
    return <p key={i}>{inlineBold(block)}</p>;
  });
}

/** Inline **bold** → <strong>, preserving the rest as text. */
function inlineBold(s: string): React.ReactNode {
  if (!s.includes("**")) return s;
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    return m ? <strong key={i}>{m[1]}</strong> : <span key={i}>{p}</span>;
  });
}
