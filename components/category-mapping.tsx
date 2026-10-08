"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Tags } from "lucide-react";

import { MAGAZINES } from "@/lib/magazines";
import { useLang } from "@/lib/i18n/context";

const DESKS = MAGAZINES.filter((m) => (m.group ?? "patrika") === "patrika" && m.key !== "custom");
// Reserved key for the single global Patrika Plus category slug (matches
// PATRIKA_PLUS_SLUG_KEY in lib/cms-categories, kept here to avoid importing the
// server-only module into this client component).
const PP_KEY = "__patrika_plus__";

export function CategoryMapping() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const [slugs, setSlugs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/category-slugs", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setSlugs(j.slugs ?? {});
      }
    } catch {
      /* advisory */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setSlugs((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/category-slugs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slugs }),
      });
      const j = await r.json();
      if (!r.ok) setMsg({ ok: false, text: j.error ?? "Failed" });
      else setMsg({ ok: true, text: hi ? "सेव हो गया।" : "Saved." });
    } catch {
      setMsg({ ok: false, text: hi ? "नेटवर्क त्रुटि" : "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-2.5 mb-1">
        <Tags size={20} className="text-[var(--purple)]" />
        <h1 className="text-[20px] font-semibold text-[var(--text)]">{hi ? "कैटेगरी मैपिंग" : "Category Mapping"}</h1>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi
          ? "CMS कैटेगरी स्लग सेट करें। Quick Bytes में डेस्क का टॉपिकल स्लग category के रूप में जाता है। Patrika+ में ग्लोबल पत्रिका+ स्लग और डेस्क का टॉपिकल स्लग — दोनों category array में जाते हैं। स्लग खाली है तो वह नहीं भेजा जाता।"
          : "Set the CMS category slugs. Quick Bytes sends the desk's topical slug as category. Patrika+ sends BOTH the global Patrika Plus slug and the desk's topical slug (as a category array). Blank slugs are not sent."}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-8"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : (
        <>
          {/* Global Patrika Plus category — sent on every Patrika+ post. */}
          <div className="bg-white border border-[var(--border)] rounded-xl p-4 mb-4">
            <label className="block text-[12px] font-medium text-[var(--text-2)] mb-1">
              {hi ? "CMS पत्रिका+ कैटेगरी स्लग (ग्लोबल — हर Patrika+ पोस्ट पर भेजी जाती है)" : "CMS Patrika Plus category slug (global — sent on every Patrika+ post)"}
            </label>
            <input value={slugs[PP_KEY] ?? ""} onChange={(e) => set(PP_KEY, e.target.value)} placeholder={hi ? "जैसे patrika-plus" : "e.g. patrika-plus"}
              className="w-full max-w-[280px] bg-white border border-[var(--border)] text-[13px] px-3 py-1.5 rounded outline-none focus:border-[var(--purple)] font-mono" />
          </div>

          <div className="text-[12px] font-medium text-[var(--text-2)] mb-1.5">{hi ? "डेस्क टॉपिकल कैटेगरी" : "Desk topical categories"}</div>
          <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--surface-2)] text-[var(--text-3)] text-[11px] uppercase">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">{hi ? "डेस्क" : "Desk"}</th>
                  <th className="text-left font-medium px-4 py-2.5">{hi ? "CMS कैटेगरी स्लग" : "CMS category slug"}</th>
                </tr>
              </thead>
              <tbody>
                {DESKS.map((m) => (
                  <tr key={m.key} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 text-[var(--text-1)]">
                      <span className="font-medium">{hi ? m.nameHi : m.nameEn}</span>
                      <span className="text-[11px] text-[var(--text-3)] ml-2">{hi ? m.nameEn : m.nameHi}</span>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={slugs[m.key] ?? ""}
                        onChange={(e) => set(m.key, e.target.value)}
                        placeholder={hi ? "जैसे patrikaplus" : "e.g. patrikaplus"}
                        className="w-full max-w-[280px] bg-white border border-[var(--border)] text-[13px] px-3 py-1.5 rounded outline-none focus:border-[var(--purple)] font-mono"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button onClick={save} disabled={saving}
              className="bg-[var(--text)] hover:bg-black text-white text-[13px] font-medium px-4 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 size={13} className="animate-spin" />} {hi ? "सेव करें" : "Save"}
            </button>
            {msg && <span className={`text-[12px] ${msg.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{msg.text}</span>}
          </div>
        </>
      )}
    </div>
  );
}
