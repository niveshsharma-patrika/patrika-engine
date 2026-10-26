"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Check, AlertCircle } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

/** Admin: the print house-style directive — injected into every print draft the
 *  AI writes (tone, dateline format, honorifics, what to avoid…). */
export function PrintDirective() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/print/admin/directive", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.error) setError(j.error); else setValue(j.value ?? ""); })
      .catch(() => setError(hi ? "नेटवर्क त्रुटि" : "Network error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const r = await fetch("/api/print/admin/directive", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ value }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      setSaved(true);
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "हाउस स्टाइल निर्देश" : "House-style directive"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-4">
        {hi ? "यह निर्देश प्रिंट की हर AI-लिखी स्टोरी में लागू होता है — भाषा का स्तर, डेटलाइन, सम्मानसूचक शब्द, क्या न लिखें। 4000 अक्षरों तक।" : "Applied to every AI-written print story — register, dateline style, honorifics, what to avoid. Up to 4000 characters."}
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : (
        <div className="bg-white border border-[var(--border)] rounded-xl p-4">
          <textarea value={value} onChange={(e) => { setValue(e.target.value); setSaved(false); }} rows={14} maxLength={4000}
            placeholder={hi ? "जैसे: सरल, औपचारिक हिंदी; पहली पंक्ति में डेटलाइन 'जयपुर।'; अंग्रेज़ी शब्द देवनागरी में; किसी व्यक्ति का नाम बिना पद के न लिखें…" : "e.g. Plain, formal Hindi; dateline on the first line as 'जयपुर।'; English terms in Devanagari; never a name without designation…"}
            className="w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-[13.5px] leading-relaxed outline-none focus:border-[var(--red)] resize-y" />
          <div className="flex items-center gap-3 mt-3">
            <button onClick={save} disabled={saving} className="bg-[var(--red)] hover:bg-[var(--red-hover)] disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {hi ? "सेव करें" : "Save"}
            </button>
            <span className="text-[11.5px] text-[var(--text-3)]">{value.length}/4000</span>
            {saved && <span className="text-[12px] text-[var(--green)] inline-flex items-center gap-1"><Check size={13} /> {hi ? "सेव हो गया" : "Saved"}</span>}
            {error && <span className="text-[12px] text-[var(--red)] inline-flex items-center gap-1"><AlertCircle size={13} /> {error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
