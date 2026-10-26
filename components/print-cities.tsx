"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, AlertCircle, MapPin } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type City = { key: string; name_en: string; name_hi: string; region: string; active: boolean; sort: number };

/** Admin: the print desk's cities / editions. Adding one also creates its two
 *  local feeds; turning one off also turns its feeds off. */
export function PrintCities() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameHi, setNameHi] = useState("");
  const [region, setRegion] = useState<"rajasthan" | "metro">("rajasthan");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/print/admin/cities", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      setCities(j.cities ?? []);
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setLoading(false);
    }
  }, [hi]);
  useEffect(() => { load(); }, [load]);

  async function toggle(c: City) {
    setCities((prev) => prev.map((x) => (x.key === c.key ? { ...x, active: !x.active } : x)));
    const r = await fetch("/api/print/admin/cities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: c.key, active: !c.active }) }).catch(() => null);
    if (!r?.ok) { setError((await r?.json().catch(() => null))?.error ?? (hi ? "नेटवर्क त्रुटि" : "Network error")); load(); }
  }

  async function add() {
    if (!nameEn.trim() || !nameHi.trim() || adding) return;
    setAdding(true); setError(null);
    try {
      const r = await fetch("/api/print/admin/cities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name_en: nameEn.trim(), name_hi: nameHi.trim(), region }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      setNameEn(""); setNameHi("");
      await load();
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setAdding(false);
    }
  }

  const field = "border border-[var(--border)] rounded px-2 py-1.5 text-[13px] bg-white outline-none focus:border-[var(--red)]";
  const groups: Array<{ key: string; label: string; list: City[] }> = [
    { key: "rajasthan", label: hi ? "राजस्थान" : "Rajasthan", list: cities.filter((c) => c.region === "rajasthan") },
    { key: "metro", label: hi ? "बड़े शहर" : "Metros", list: cities.filter((c) => c.region !== "rajasthan") },
  ];

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "शहर / संस्करण" : "Cities / editions"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-4">
        {hi ? "प्रिंट डेस्क जिन शहरों को कवर करता है। नया शहर जोड़ने पर उसकी हिंदी + अंग्रेज़ी लोकल फ़ीड अपने-आप बनती हैं।" : "The cities the print desk covers. Adding a city creates its Hindi + English local feeds automatically."}
      </p>

      <div className="bg-white border border-[var(--border)] rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
        <label className="text-[12px] text-[var(--text-2)]">{hi ? "नाम (English)" : "Name (English)"}<br /><input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Bhiwadi" className={`${field} min-w-[160px]`} /></label>
        <label className="text-[12px] text-[var(--text-2)]">{hi ? "नाम (हिंदी)" : "Name (Hindi)"}<br /><input value={nameHi} onChange={(e) => setNameHi(e.target.value)} placeholder="भिवाड़ी" className={`${field} min-w-[160px]`} /></label>
        <label className="text-[12px] text-[var(--text-2)]">{hi ? "क्षेत्र" : "Region"}<br />
          <select value={region} onChange={(e) => setRegion(e.target.value as "rajasthan" | "metro")} className={field}>
            <option value="rajasthan">{hi ? "राजस्थान" : "Rajasthan"}</option><option value="metro">{hi ? "बड़ा शहर" : "Metro"}</option>
          </select>
        </label>
        <button onClick={add} disabled={!nameEn.trim() || !nameHi.trim() || adding} className="bg-[var(--red)] hover:bg-[var(--red-hover)] disabled:opacity-40 text-white text-[13px] font-medium px-3.5 py-2 rounded flex items-center gap-1.5">
          {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {hi ? "शहर जोड़ें" : "Add city"}
        </button>
      </div>

      {error && <div className="flex items-center gap-2 text-[13px] text-[var(--red)] mb-3"><AlertCircle size={15} /> {error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((g) => (
            <section key={g.key} className="bg-white border border-[var(--border)] rounded-xl">
              <div className="px-4 py-2 border-b border-[var(--border)] text-[13px] font-semibold flex items-center gap-2">{g.label} <span className="text-[11px] text-[var(--text-3)] font-normal">{g.list.filter((c) => c.active).length}/{g.list.length}</span></div>
              <ul className="divide-y divide-[var(--border)]">
                {g.list.map((c) => (
                  <li key={c.key} className="px-4 py-2 flex items-center gap-3">
                    <MapPin size={13} className={c.active ? "text-[var(--red)]" : "text-[var(--text-3)]"} />
                    <div className="flex-1 min-w-0 text-[13px]">{hi ? c.name_hi : c.name_en} <span className="text-[11px] text-[var(--text-3)]">{hi ? c.name_en : c.name_hi}</span></div>
                    <button onClick={() => toggle(c)} role="switch" aria-checked={c.active}
                      className={`relative w-9 h-5 rounded-full transition-colors ${c.active ? "bg-[var(--green)]" : "bg-[var(--border)]"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${c.active ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
