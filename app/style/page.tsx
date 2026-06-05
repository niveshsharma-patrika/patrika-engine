"use client";

/**
 * /style — Style Module v2.
 *
 * Two assets that teach the drafting AI Patrika's voice:
 *   1. Editorial guidelines (singleton, big textarea)
 *   2. Sample articles (many, paste OR pull from URL)
 *
 * Both get loaded by /api/drafts/generate on every draft request and
 * injected into the prompt as system instructions + few-shot examples.
 */

import { useEffect, useRef, useState } from "react";
import { Plus, X, Save, Trash2, FileText, Loader2, ExternalLink, Link as LinkIcon, Upload, Download } from "lucide-react";

import { Shell } from "@/components/shell";
import { useLang } from "@/lib/i18n/context";

type Sample = {
  id: string;
  title: string;
  body: string;
  story_type: string | null;
  source_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Guidelines = {
  id: string;
  content: string;
  notes: string | null;
  updated_at: string;
} | null;

const STORY_TYPES = [
  "Breaking news",
  "Analysis",
  "Explainer",
  "Profile",
  "Service piece",
  "Investigation",
  "Op-ed",
  "Sidebar",
  "Feature",
] as const;

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

export default function StylePage() {
  const { lang } = useLang();
  const [guidelines, setGuidelines] = useState<Guidelines>(null);
  const [guidelinesText, setGuidelinesText] = useState("");
  const [guidelinesNotes, setGuidelinesNotes] = useState("");
  const [savingGuide, setSavingGuide] = useState(false);
  const [guideSavedAt, setGuideSavedAt] = useState<string | null>(null);

  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAdd, setOpenAdd] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    inserted: number;
    skipped: { row: number; reason: string }[];
  } | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function reloadSamples() {
    const r = await fetch("/api/style/samples", { cache: "no-store" });
    const j = await r.json();
    setSamples((j.samples ?? []) as Sample[]);
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkUploading(true);
    setBulkResult(null);
    setBulkError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/style/samples/bulk", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setBulkError(json.error ?? "Upload failed");
      } else {
        setBulkResult({
          inserted: json.inserted ?? 0,
          skipped: json.skipped ?? [],
        });
        await reloadSamples();
      }
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [gRes, sRes] = await Promise.all([
          fetch("/api/style/guidelines", { cache: "no-store" }),
          fetch("/api/style/samples", { cache: "no-store" }),
        ]);
        const gJson = await gRes.json();
        const sJson = await sRes.json();
        if (cancelled) return;
        const g = (gJson.guidelines ?? null) as Guidelines;
        setGuidelines(g);
        setGuidelinesText(g?.content ?? "");
        setGuidelinesNotes(g?.notes ?? "");
        setSamples((sJson.samples ?? []) as Sample[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveGuidelines() {
    setSavingGuide(true);
    try {
      const res = await fetch("/api/style/guidelines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: guidelinesText, notes: guidelinesNotes }),
      });
      const json = await res.json();
      if (json.guidelines) {
        setGuidelines(json.guidelines);
        setGuideSavedAt(new Date().toISOString());
      }
    } finally {
      setSavingGuide(false);
    }
  }

  async function deleteSample(id: string) {
    const ok = window.confirm(
      lang === "hi"
        ? "इस सैंपल को हटाना है?"
        : "Delete this sample?"
    );
    if (!ok) return;
    const res = await fetch(`/api/style/samples/${id}`, { method: "DELETE" });
    if (res.ok) setSamples((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <Shell>
      <section className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight mb-2">
          {lang === "hi" ? "शैली मॉड्यूल" : "Style Module"}
        </h1>
        <p className="text-[14px] text-[var(--text-2)] max-w-3xl leading-relaxed">
          {lang === "hi"
            ? "एडिटोरियल दिशानिर्देश और सैंपल लेख जो AI को पत्रिका की आवाज़ में लिखना सिखाते हैं। ये दोनों हर ड्राफ्ट जनरेशन के समय प्रॉम्प्ट में जुड़ते हैं।"
            : "Editorial guidelines and sample articles that teach the drafting AI Patrika's voice. Both are injected into every draft-generation prompt."}
        </p>
      </section>

      {loading ? (
        <div className="text-sm text-[var(--text-3)]">
          {lang === "hi" ? "लोड हो रहा है…" : "Loading…"}
        </div>
      ) : (
        <>
          {/* GUIDELINES */}
          <section className="bg-white border border-[var(--border)] rounded-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[17px] font-semibold">
                  {lang === "hi" ? "पत्रिका के दिशानिर्देश" : "Patrika Guidelines"}
                </h2>
                <p className="text-[12px] text-[var(--text-3)] mt-1">
                  {lang === "hi"
                    ? "स्टाइल गाइड, बैन-वर्ड्स, हेडलाइन बाइबल, हिंदी शैली, सब कुछ एक जगह।"
                    : "Style book, banned phrases, headline rules, Hindi conventions — everything in one place."}
                </p>
              </div>
              <span className="text-[11px] font-mono text-[var(--text-3)]">
                {lang === "hi" ? "अंतिम बार सहेजा गया" : "Last saved"}:{" "}
                {fmtTime(guideSavedAt ?? guidelines?.updated_at ?? null)}
              </span>
            </div>

            <textarea
              value={guidelinesText}
              onChange={(e) => setGuidelinesText(e.target.value)}
              rows={12}
              placeholder={
                lang === "hi"
                  ? "यहाँ पत्रिका के संपादकीय दिशानिर्देश पेस्ट करें…"
                  : "Paste Patrika's editorial guidelines here. Long-form OK. Markdown welcome."
              }
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--text-3)] rounded p-3 text-[13.5px] leading-relaxed font-sans outline-none resize-y min-h-[200px]"
            />

            <div className="mt-3 flex items-end gap-3">
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wider text-[var(--text-3)] font-medium block mb-1.5">
                  {lang === "hi" ? "नोट्स (ऐच्छिक)" : "Internal notes (optional)"}
                </label>
                <input
                  type="text"
                  value={guidelinesNotes}
                  onChange={(e) => setGuidelinesNotes(e.target.value)}
                  placeholder={
                    lang === "hi"
                      ? "जैसे: 'अक्टूबर 2026 संशोधन - मुख्य संपादक द्वारा अनुमोदित'"
                      : "e.g. 'October 2026 revision — approved by EIC'"
                  }
                  className="w-full bg-white border border-[var(--border)] rounded px-3 py-1.5 text-[13px] outline-none focus:border-[var(--text-3)]"
                />
              </div>
              <button
                onClick={saveGuidelines}
                disabled={savingGuide || !guidelinesText.trim()}
                className="flex items-center gap-2 bg-[var(--text)] hover:bg-black text-white text-[13px] font-medium px-4 py-2 rounded disabled:bg-[var(--text-3)] disabled:cursor-not-allowed"
              >
                {savingGuide ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {lang === "hi" ? "सहेजें" : "Save"}
              </button>
            </div>
          </section>

          {/* SAMPLES */}
          <section className="bg-white border border-[var(--border)] rounded-md p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-[17px] font-semibold">
                  {lang === "hi" ? "सैंपल लेख" : "Sample Articles"}
                </h2>
                <p className="text-[12px] text-[var(--text-3)] mt-1">
                  {lang === "hi"
                    ? `${samples.length} सैंपल जोड़े गए। ड्राफ्ट जनरेशन के समय AI सबसे मिलते-जुलते 2-3 सैंपल चुनता है।`
                    : `${samples.length} samples added. The AI picks 2-3 best-matched samples by story type for each draft.`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="/api/style/sample-csv"
                  download
                  className="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--text-2)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--text-3)] bg-white px-3 py-1.5 rounded"
                  title={
                    lang === "hi"
                      ? "नमूना CSV टेम्पलेट डाउनलोड करें"
                      : "Download sample CSV template"
                  }
                >
                  <Download size={13} />
                  {lang === "hi" ? "टेम्पलेट" : "Template"}
                </a>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={bulkUploading}
                  className="flex items-center gap-1.5 text-[12.5px] font-medium text-white bg-[var(--text)] hover:bg-black px-3 py-1.5 rounded disabled:bg-[var(--text-3)]"
                >
                  {bulkUploading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Upload size={13} />
                  )}
                  {lang === "hi" ? "CSV अपलोड" : "Bulk import CSV"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                />

                <button
                  onClick={() => setOpenAdd(true)}
                  className="flex items-center gap-1.5 bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[12.5px] font-medium px-3 py-1.5 rounded"
                >
                  <Plus size={13} />
                  {lang === "hi" ? "सैंपल जोड़ें" : "Add sample"}
                </button>
              </div>
            </div>

            {/* Bulk upload result / error */}
            {bulkResult && (
              <div className="mb-4 bg-[var(--green-soft)] border border-[var(--green)] rounded px-3.5 py-2.5 text-[12.5px]">
                <strong className="text-[var(--green)]">
                  {lang === "hi"
                    ? `${bulkResult.inserted} सैंपल जोड़े गए।`
                    : `Imported ${bulkResult.inserted} sample${bulkResult.inserted === 1 ? "" : "s"}.`}
                </strong>
                {bulkResult.skipped.length > 0 && (
                  <span className="text-[var(--text-2)]">
                    {" "}
                    {lang === "hi"
                      ? `${bulkResult.skipped.length} पंक्तियाँ छोड़ी गईं`
                      : `${bulkResult.skipped.length} row${bulkResult.skipped.length === 1 ? "" : "s"} skipped`}
                    {": "}
                    {bulkResult.skipped
                      .slice(0, 3)
                      .map((s) => `row ${s.row} (${s.reason})`)
                      .join(", ")}
                    {bulkResult.skipped.length > 3 && "…"}
                  </span>
                )}
                <button
                  onClick={() => setBulkResult(null)}
                  className="ml-2 text-[var(--text-3)] hover:text-[var(--text)]"
                >
                  ×
                </button>
              </div>
            )}
            {bulkError && (
              <div className="mb-4 bg-[var(--red-soft)] border border-[var(--red)] rounded px-3.5 py-2.5 text-[12.5px] text-[var(--red)]">
                {bulkError}
                <button
                  onClick={() => setBulkError(null)}
                  className="ml-2 hover:underline"
                >
                  ×
                </button>
              </div>
            )}

            {samples.length === 0 ? (
              <div className="border border-dashed border-[var(--border)] rounded-md p-10 text-center">
                <FileText size={28} className="mx-auto text-[var(--text-3)] mb-3" />
                <p className="text-[14px] text-[var(--text-2)]">
                  {lang === "hi"
                    ? "अभी कोई सैंपल नहीं है। पत्रिका की एक अच्छी कहानी पेस्ट करें या उसका URL दें।"
                    : "No samples yet. Paste a Patrika story or its URL to teach the AI."}
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 list-none m-0 p-0">
                {samples.map((s) => (
                  <li
                    key={s.id}
                    className="border border-[var(--border)] hover:border-[var(--border-2)] rounded-md p-4 group"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[14px] font-medium leading-snug">
                          {s.title}
                        </h4>
                        {s.story_type && (
                          <span className="inline-block mt-1.5 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)]">
                            {s.story_type}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteSample(s.id)}
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-3)] hover:text-[var(--red)]"
                        title={lang === "hi" ? "हटाएँ" : "Delete"}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-[12.5px] text-[var(--text-2)] line-clamp-3 leading-relaxed">
                      {s.body}
                    </p>
                    <div className="flex items-center gap-3 mt-3 text-[11px] text-[var(--text-3)] font-mono">
                      <span>{s.body.length.toLocaleString()} chars</span>
                      <span>·</span>
                      <span>{fmtTime(s.created_at)}</span>
                      {s.source_url && (
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto inline-flex items-center gap-1 hover:text-[var(--red)]"
                        >
                          <ExternalLink size={11} />
                          {lang === "hi" ? "स्रोत" : "source"}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {openAdd && (
        <AddSampleModal
          onClose={() => setOpenAdd(false)}
          onCreated={(s) => {
            setSamples((prev) => [s, ...prev]);
            setOpenAdd(false);
          }}
        />
      )}
    </Shell>
  );
}

// ─── Add sample modal ──────────────────────────────────────────
function AddSampleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (s: Sample) => void;
}) {
  const { lang } = useLang();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [storyType, setStoryType] = useState("");
  const [notes, setNotes] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pullFromUrl() {
    if (!urlInput.trim()) return;
    setFetching(true);
    setErr(null);
    try {
      const res = await fetch("/api/style/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setErr(json.error ?? "Failed to extract");
      } else {
        setTitle(json.title || title);
        setBody(json.body || body);
        setSourceUrl(json.sourceUrl ?? urlInput.trim());
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }

  async function save() {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/style/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          story_type: storyType || undefined,
          source_url: sourceUrl ?? undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setErr(json.error ?? "Failed to save");
      } else {
        onCreated(json.sample as Sample);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute top-[5vh] left-1/2 -translate-x-1/2 w-[680px] max-w-[92vw] max-h-[90vh] bg-white rounded-md shadow-[0_20px_60px_rgba(0,0,0,0.2)] flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-[16px] font-semibold">
            {lang === "hi" ? "नया सैंपल" : "Add a sample article"}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-2)] hover:text-[var(--text)] w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--surface-2)]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* URL ingest row */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-3)] font-medium block mb-1.5 flex items-center gap-1.5">
              <LinkIcon size={11} />
              {lang === "hi" ? "URL से खींचें (वैकल्पिक)" : "Pull from URL (optional)"}
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.thehindu.com/article/…"
                className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--text-3)] rounded px-3 py-1.5 text-[13px] outline-none"
              />
              <button
                onClick={pullFromUrl}
                disabled={fetching || !urlInput.trim()}
                className="flex items-center gap-1.5 bg-[var(--text)] hover:bg-black text-white text-[12.5px] font-medium px-3 py-1.5 rounded disabled:bg-[var(--text-3)] whitespace-nowrap"
              >
                {fetching ? <Loader2 size={12} className="animate-spin" /> : null}
                {lang === "hi" ? "खींचें" : "Extract"}
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-3)] mt-1.5">
              {lang === "hi"
                ? "हम Mozilla Readability से लेख का मुख्य भाग निकाल लेंगे। आप उसे नीचे एडिट कर सकते हैं।"
                : "We'll fetch and extract the article body via Mozilla Readability. Edit below before saving."}
            </p>
          </div>

          <hr className="border-[var(--border)]" />

          {/* Title */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-3)] font-medium block mb-1.5">
              {lang === "hi" ? "शीर्षक *" : "Title *"}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lang === "hi" ? "लेख का शीर्षक" : "Article headline"}
              className="w-full bg-white border border-[var(--border)] focus:border-[var(--text-3)] rounded px-3 py-1.5 text-[13.5px] outline-none"
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-3)] font-medium block mb-1.5">
              {lang === "hi" ? "लेख का मुख्य भाग *" : "Article body *"}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder={
                lang === "hi"
                  ? "लेख का पूरा मुख्य भाग यहाँ पेस्ट करें…"
                  : "Paste the full article body here…"
              }
              className="w-full bg-white border border-[var(--border)] focus:border-[var(--text-3)] rounded p-3 text-[13px] outline-none resize-y min-h-[200px] leading-relaxed"
            />
            <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">
              {body.length.toLocaleString()} chars
            </div>
          </div>

          {/* Story type + notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-3)] font-medium block mb-1.5">
                {lang === "hi" ? "स्टोरी टाइप (ऐच्छिक)" : "Story type (optional)"}
              </label>
              <select
                value={storyType}
                onChange={(e) => setStoryType(e.target.value)}
                className="w-full bg-white border border-[var(--border)] focus:border-[var(--text-3)] rounded px-3 py-1.5 text-[13px] outline-none"
              >
                <option value="">— {lang === "hi" ? "कोई नहीं" : "none"} —</option>
                {STORY_TYPES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-3)] font-medium block mb-1.5">
                {lang === "hi" ? "नोट (ऐच्छिक)" : "Note (optional)"}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  lang === "hi" ? "जैसे: 'बेहतरीन सर्विस पीस उदाहरण'" : "e.g. 'Great service-piece exemplar'"
                }
                className="w-full bg-white border border-[var(--border)] focus:border-[var(--text-3)] rounded px-3 py-1.5 text-[13px] outline-none"
              />
            </div>
          </div>

          {err && (
            <div className="bg-[var(--red-soft)] border border-[var(--red)] text-[var(--red)] rounded px-3 py-2 text-[12px]">
              {err}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-[13px] font-medium px-4 py-2 rounded border border-[var(--border)] hover:bg-[var(--surface-2)]"
          >
            {lang === "hi" ? "रद्द करें" : "Cancel"}
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim() || !body.trim()}
            className="flex items-center gap-2 bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[13px] font-medium px-4 py-2 rounded disabled:bg-[var(--text-3)]"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {lang === "hi" ? "सहेजें" : "Save sample"}
          </button>
        </footer>
      </div>
    </div>
  );
}
