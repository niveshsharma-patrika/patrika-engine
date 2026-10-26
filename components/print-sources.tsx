"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Rss, AlertCircle, ExternalLink } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { timeAgo } from "@/lib/print/ui";

type Src = { id: string; name: string; url: string; language: string; city: string | null; is_active: boolean; last_sync: string | null; signals_24h: number | string | null };
type City = { key: string; name_en: string; name_hi: string; region: string; active: boolean };

/** Admin: the print desk's own per-city feeds — toggle, add a feed (Google
 *  News default or a publication's own RSS). */
export function PrintSources() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const [sources, setSources] = useState<Src[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState<"hi" | "en">("hi");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [onlyCity, setOnlyCity] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        fetch("/api/print/admin/sources", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/print/admin/cities", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (s.error) { setError(s.error); return; }
      setSources(s.sources ?? []);
      setCities(c.cities ?? []);
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setLoading(false);
    }
  }, [hi]);
  useEffect(() => { load(); }, [load]);

  async function toggle(s: Src) {
    setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_active: !x.is_active } : x)));
    const r = await fetch("/api/print/admin/sources", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id, is_active: !s.is_active }) }).catch(() => null);
    if (!r?.ok) { setError((await r?.json().catch(() => null))?.error ?? (hi ? "नेटवर्क त्रुटि" : "Network error")); load(); }
  }

  async function add() {
    if (!city || adding) return;
    setAdding(true); setError(null);
    try {
      const r = await fetch("/api/print/admin/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city, language, url: url.trim() || undefined }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      if (j.existed) setError(hi ? "यह फ़ीड पहले से मौजूद है।" : "That feed already exists.");
      setUrl("");
      await load();
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setAdding(false);
    }
  }

  const byCity = new Map<string, Src[]>();
  for (const s of sources) {
    if (onlyCity && s.city !== onlyCity) continue;
    const k = s.city ?? "—";
    byCity.set(k, [...(byCity.get(k) ?? []), s]);
  }
  const cityName = (k: string) => { const c = cities.find((x) => x.key === k); return c ? (hi ? c.name_hi : c.name_en) : k; };
  const field = "border border-[var(--border)] rounded px-2 py-1.5 text-[13px] bg-white outline-none focus:border-[var(--red)]";

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "प्रिंट सोर्स" : "Print sources"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-4">
        {hi ? "हर शहर की लोकल फ़ीड (प्रिंट डेस्क की अपनी)। डिफ़ॉल्ट Google News शहर-खोज है जो कई प्रकाशनों को जोड़ती है; किसी अख़बार की RSS भी जोड़ सकते हैं।" : "Each city's local feeds (the print desk's own). The default is a Google News city search that aggregates many publications; you can also add a publication's RSS."}
      </p>

      <div className="bg-white border border-[var(--border)] rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
        <label className="text-[12px] text-[var(--text-2)]">{hi ? "शहर" : "City"}<br />
          <select value={city} onChange={(e) => setCity(e.target.value)} className={`${field} min-w-[180px]`}>
            <option value="">{hi ? "चुनें…" : "Choose…"}</option>
            {cities.map((c) => <option key={c.key} value={c.key}>{hi ? c.name_hi : c.name_en}{c.active ? "" : " (off)"}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-[var(--text-2)]">{hi ? "भाषा" : "Language"}<br />
          <select value={language} onChange={(e) => setLanguage(e.target.value as "hi" | "en")} className={field}>
            <option value="hi">हिंदी</option><option value="en">English</option>
          </select>
        </label>
        <label className="text-[12px] text-[var(--text-2)] flex-1 min-w-[240px]">{hi ? "फ़ीड URL (खाली = Google News)" : "Feed URL (blank = Google News)"}<br />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/rss" className={`${field} w-full`} />
        </label>
        <button onClick={add} disabled={!city || adding} className="bg-[var(--red)] hover:bg-[var(--red-hover)] disabled:opacity-40 text-white text-[13px] font-medium px-3.5 py-2 rounded flex items-center gap-1.5">
          {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {hi ? "फ़ीड जोड़ें" : "Add feed"}
        </button>
      </div>

      {error && <div className="flex items-center gap-2 text-[13px] text-[var(--red)] mb-3"><AlertCircle size={15} /> {error}</div>}

      <div className="flex items-center gap-3 mb-3 text-[12px] text-[var(--text-2)]">
        <span>{sources.length} {hi ? "फ़ीड" : "feeds"} · {sources.filter((s) => s.is_active).length} {hi ? "चालू" : "active"}</span>
        <select value={onlyCity} onChange={(e) => setOnlyCity(e.target.value)} className={field}>
          <option value="">{hi ? "सभी शहर" : "All cities"}</option>
          {cities.map((c) => <option key={c.key} value={c.key}>{hi ? c.name_hi : c.name_en}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : (
        <div className="space-y-3">
          {[...byCity.entries()].map(([k, list]) => (
            <section key={k} className="bg-white border border-[var(--border)] rounded-xl">
              <div className="px-4 py-2 border-b border-[var(--border)] text-[13px] font-semibold flex items-center gap-2">{cityName(k)} <span className="text-[11px] text-[var(--text-3)] font-normal">{list.length}</span></div>
              <ul className="divide-y divide-[var(--border)]">
                {list.map((s) => (
                  <li key={s.id} className="px-4 py-2 flex items-center gap-3">
                    <Rss size={13} className={s.is_active ? "text-[var(--red)]" : "text-[var(--text-3)]"} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate">{s.name} <span className="text-[11px] text-[var(--text-3)]">{s.language}</span></div>
                      <div className="text-[11px] text-[var(--text-3)] flex items-center gap-2">
                        <span>{Number(s.signals_24h ?? 0)} {hi ? "/24घं" : "/24h"}</span>
                        {s.last_sync && <span>{hi ? "सिंक" : "synced"} {timeAgo(s.last_sync, hi)}</span>}
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-[var(--red)]"><ExternalLink size={10} /> url</a>
                      </div>
                    </div>
                    <button onClick={() => toggle(s)} role="switch" aria-checked={s.is_active}
                      className={`relative w-9 h-5 rounded-full transition-colors ${s.is_active ? "bg-[var(--green)]" : "bg-[var(--border)]"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${s.is_active ? "left-[18px]" : "left-0.5"}`} />
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
