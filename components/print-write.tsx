"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Save, Check, AlertCircle } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Generated = { title: string; body: string };

export function PrintWrite() {
  const { lang } = useLang();
  const hi = lang === "hi";

  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [gen, setGen] = useState<Generated | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; status: string } | null>(null);

  // Prefill the topic from ?title= when arriving from a "Write" button.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("title");
    if (t) setTopic(t);
  }, []);

  async function generate() {
    if (topic.trim().length < 4 || generating) return;
    setGenerating(true); setError(null); setSaved(null);
    try {
      const r = await fetch("/api/drafts/generate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ trendId: null, title: topic.trim(), mode: "factual", lang: hi ? "hi" : "en" }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Generation failed"); }
      else {
        // The no-trend path echoes the topic back as `title`; the real AI
        // headlines are in `titles` — pick the first that isn't the topic.
        const topicNorm = topic.trim();
        const titles: string[] = Array.isArray(j.titles) ? j.titles : [];
        const headline = (titles.find((t) => typeof t === "string" && t.trim() && t.trim() !== topicNorm) ?? j.title ?? "").trim();
        const g = { title: headline, body: (j.body ?? "").trim() };
        setGen(g); setTitle(g.title); setBody(g.body);
      }
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setGenerating(false);
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
      else setSaved({ id: j.id, status: j.status });
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
        {hi ? "विषय लिखें — रिसर्च, सोर्स-वेरिफिकेशन और फैक्ट-चेक पाइपलाइन ड्राफ़्ट बनाएगी, जिसे आप एडिट कर ड्राफ़्ट में सेव कर सकते हैं।" : "Enter a topic — the research / source-verification / fact-check pipeline drafts it; edit and save to your drafts."}
      </p>

      <div className="bg-white border border-[var(--border)] rounded-xl p-4 mb-4">
        <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1.5">{hi ? "विषय" : "Topic"}</label>
        <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} maxLength={300}
          placeholder={hi ? "जैसे: शहर में जलभराव की समस्या और नगर निगम की तैयारी" : "e.g. The city's waterlogging problem and what the municipal body is doing"}
          className={`${field} resize-none`} />
        <button onClick={generate} disabled={generating || topic.trim().length < 4}
          className="mt-3 bg-[var(--red)] hover:bg-[var(--red-hover)] disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded flex items-center gap-1.5">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {generating ? (hi ? "लिखा जा रहा है…" : "Writing…") : gen ? (hi ? "फिर से बनाएँ" : "Regenerate") : (hi ? "ड्राफ़्ट बनाएँ" : "Generate draft")}
        </button>
        {generating && <p className="text-[11.5px] text-[var(--text-3)] mt-2">{hi ? "इसमें एक मिनट तक लग सकता है।" : "This can take up to a minute."}</p>}
      </div>

      {error && <div className="flex items-center gap-2 text-[13px] text-[var(--red)] mb-4"><AlertCircle size={15} /> {error}</div>}

      {gen && (
        <div className="bg-white border border-[var(--border)] rounded-xl p-4">
          <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1.5">{hi ? "शीर्षक" : "Headline"}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} mb-3 font-medium`} />
          <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1.5">{hi ? "लेख" : "Body"}</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className={`${field} leading-relaxed`} />

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
