"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Tags } from "lucide-react";

import { MAGAZINES } from "@/lib/magazines";
import { useLang } from "@/lib/i18n/context";

const DESKS = MAGAZINES.filter((m) => (m.group ?? "patrika") === "patrika" && m.key !== "custom");

type DeskCategories = { slug: string; ppSlug: string };

export function CategoryMapping() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const [mappings, setMappings] = useState<Record<string, DeskCategories>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/category-slugs", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setMappings(j.mappings ?? {});
      }
    } catch {
      /* advisory */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, field: keyof DeskCategories, v: string) =>
    setMappings((prev) => ({
      ...prev,
      [k]: { slug: prev[k]?.slug ?? "", ppSlug: prev[k]?.ppSlug ?? "", [field]: v },
    }));

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/category-slugs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mappings }),
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

  const inputCls =
    "w-full bg-white border border-[var(--border)] text-[13px] px-3 py-1.5 rounded outline-none focus:border-[var(--purple)] font-mono";

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2.5 mb-1">
        <Tags size={20} className="text-[var(--purple)]" />
        <h1 className="text-[20px] font-semibold text-[var(--text)]">{hi ? "कैटेगरी मैपिंग" : "Category Mapping"}</h1>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi
          ? "हर डेस्क के लिए दो WordPress कैटेगरी स्लग सेट करें। Patrika+ दोनों भेजता है — पहले पत्रिका+ कैटेगरी (जैसे satta-ki-zameen), फिर ग्लोबल कैटेगरी (जैसे politics-news)। Quick Bytes सिर्फ ग्लोबल कैटेगरी स्लग भेजता है। खाली स्लग नहीं भेजे जाते।"
          : "Set two WordPress category slugs per desk. Patrika+ sends both — the Patrika Plus category (e.g. satta-ki-zameen) first, then the global category (e.g. politics-news). Quick Bytes sends only the global category slug. Blank slugs are not sent."}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-8"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : (
        <>
          <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--surface-2)] text-[var(--text-3)] text-[11px] uppercase">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5 w-[30%]">{hi ? "डेस्क" : "Desk"}</th>
                  <th className="text-left font-medium px-4 py-2.5">{hi ? "पत्रिका+ कैटेगरी स्लग" : "Patrika Plus category slug"}</th>
                  <th className="text-left font-medium px-4 py-2.5">{hi ? "ग्लोबल कैटेगरी स्लग" : "Global category slug"}</th>
                </tr>
              </thead>
              <tbody>
                {DESKS.map((m) => (
                  <tr key={m.key} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 text-[var(--text-1)] align-middle">
                      <span className="font-medium">{hi ? m.nameHi : m.nameEn}</span>
                      <span className="text-[11px] text-[var(--text-3)] ml-2">{hi ? m.nameEn : m.nameHi}</span>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={mappings[m.key]?.ppSlug ?? ""}
                        onChange={(e) => set(m.key, "ppSlug", e.target.value)}
                        placeholder={hi ? "जैसे satta-ki-zameen" : "e.g. satta-ki-zameen"}
                        className={inputCls}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={mappings[m.key]?.slug ?? ""}
                        onChange={(e) => set(m.key, "slug", e.target.value)}
                        placeholder={hi ? "जैसे politics-news" : "e.g. politics-news"}
                        className={inputCls}
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
