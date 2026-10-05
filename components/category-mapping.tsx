"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Tags } from "lucide-react";

import { MAGAZINES } from "@/lib/magazines";
import { useLang } from "@/lib/i18n/context";

const DESKS = MAGAZINES.filter((m) => (m.group ?? "patrika") === "patrika" && m.key !== "custom");

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
          ? "हर पत्रिका+ डेस्क के लिए CMS कैटेगरी स्लग डालें। यह Quick Bytes प्रकाशित करते समय payload में category के रूप में भेजा जाता है। स्लग खाली है तो category नहीं भेजी जाती।"
          : "Set the CMS category slug for each Patrika+ desk. It is sent as the payload's category when publishing Quick Bytes. If a slug is blank, no category is sent."}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-8"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : (
        <>
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
