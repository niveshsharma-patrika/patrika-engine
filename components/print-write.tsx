"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Save, Check, AlertCircle, ExternalLink } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Source = { title: string; url: string; publisher: string };

export function PrintWrite() {
  const { lang } = useLang();
  const hi = lang === "hi";

  const [topic, setTopic] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fromStory, setFromStory] = useState(false);
  const [phase, setPhase] = useState<"idle" | "researching" | "writing">("idle");
  const [done, setDone] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ status: string } | null>(null);

  // Prefill from a "Write" click on a story: headline + summary become the brief.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("title") ?? "";
    const summary = sp.get("summary") ?? "";
    const url = sp.get("url") ?? "";
    if (t) { setTopic(summary ? `${t}\n\n${summary}` : t); setFromStory(Boolean(summary || url)); }
    if (url) setSourceUrl(url);
  }, []);

  const busy = phase !== "idle";

  async function generate() {
    if (topic.trim().length < 6 || busy) return;
    setError(null); setDone(false); setSaved(null); setSources([]);
    const incident = topic.trim() + (sourceUrl ? `\n\nSource: ${sourceUrl}` : "");
    const payload = { lang: hi ? "hi" : "en" };
    try {
      // 1 — research the topic/story on the web.
      setPhase("researching");
      const rr = await fetch("/api/research", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ incident, ...payload }),
      });
      const research = await rr.json();
      if (!rr.ok) { setError(research.error ?? "Research failed"); setPhase("idle"); return; }
      setSources(Array.isArray(research.sources) ? research.sources : []);

      // 2 — write a grounded article from it.
      setPhase("writing");
      const ar = await fetch("/api/research/article", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ incident, research, length: "standard", ...payload }),
      });
      const art = await ar.json();
      if (!ar.ok) { setError(art.error ?? "Writing failed"); setPhase("idle"); return; }
      setTitle((art.headline ?? "").trim());
      setBody((art.body ?? "").trim());
      setDone(true);
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setPhase("idle");
    }
  }

  async function save(status: "in_progress" | "awaiting_review") {
    if (!title.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/drafts/save", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body, status }),
      });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "Save failed");
      else setSaved({ status: j.status });
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-[var(--red)]";

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "स्टोरी लिखें" : "Write a story"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi ? "विषय या घटना लिखें — हम ऑनलाइन रिसर्च करके एक ग्राउंडेड लेख तैयार करते हैं, जिसे आप एडिट कर ड्राफ़्ट में सेव कर सकते हैं।" : "Enter a topic or incident — we research it online and write a grounded article you can edit and save to drafts."}
      </p>

      <div className="bg-white border border-[var(--border)] rounded-xl p-4 mb-4">
        <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1.5">
          {fromStory ? (hi ? "स्टोरी ब्रीफ़ (एडिट कर सकते हैं)" : "Story brief (editable)") : (hi ? "विषय" : "Topic")}
        </label>
        <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={fromStory ? 4 : 2} maxLength={2000}
          placeholder={hi ? "जैसे: शहर में जलभराव की समस्या और नगर निगम की तैयारी" : "e.g. The city's waterlogging problem and what the municipal body is doing"}
          className={`${field} resize-y`} />
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text-3)] hover:text-[var(--red)] mt-1.5">
            <ExternalLink size={11} /> {hi ? "मूल स्रोत" : "source story"}
          </a>
        )}
        <div className="flex items-center gap-3 mt-3">
          <button onClick={generate} disabled={busy || topic.trim().length < 6}
            className="bg-[var(--red)] hover:bg-[var(--red-hover)] disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded flex items-center gap-1.5">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {phase === "researching" ? (hi ? "रिसर्च हो रही है…" : "Researching…") : phase === "writing" ? (hi ? "लेख लिखा जा रहा है…" : "Writing…") : done ? (hi ? "फिर से बनाएँ" : "Regenerate") : (hi ? "रिसर्च कर लिखें" : "Research & write")}
          </button>
          {busy && <span className="text-[11.5px] text-[var(--text-3)]">{hi ? "इसमें एक मिनट तक लग सकता है।" : "This can take up to a minute."}</span>}
        </div>
      </div>

      {error && <div className="flex items-center gap-2 text-[13px] text-[var(--red)] mb-4"><AlertCircle size={15} /> {error}</div>}

      {done && (
        <div className="bg-white border border-[var(--border)] rounded-xl p-4">
          <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1.5">{hi ? "शीर्षक" : "Headline"}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} mb-3 font-medium`} />
          <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1.5">{hi ? "लेख" : "Body"}</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className={`${field} leading-relaxed`} />

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

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button onClick={() => save("in_progress")} disabled={saving || !title.trim()}
              className="bg-[var(--text)] hover:bg-black text-white text-[13px] font-medium px-4 py-2 rounded disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {hi ? "ड्राफ़्ट सेव करें" : "Save as draft"}
            </button>
            <button onClick={() => save("awaiting_review")} disabled={saving || !title.trim()}
              className="bg-white border border-[var(--border)] hover:border-[var(--red)] text-[13px] font-medium px-4 py-2 rounded disabled:opacity-50">
              {hi ? "रिव्यू के लिए भेजें" : "Submit for review"}
            </button>
            {saved && (
              <span className="text-[12px] text-[var(--green)] inline-flex items-center gap-1">
                <Check size={13} /> {saved.status === "awaiting_review" ? (hi ? "रिव्यू के लिए भेजा गया" : "Sent for review") : (hi ? "ड्राफ़्ट में सेव" : "Saved to drafts")} ·{" "}
                <Link href="/print/drafts" className="text-[var(--red)] hover:underline">{hi ? "मेरे ड्राफ़्ट" : "My Drafts"}</Link>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
