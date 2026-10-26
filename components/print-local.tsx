"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, PenSquare, MapPin, ExternalLink, Search, Clock, Newspaper } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { catLabel, timeAgo, writeHref } from "@/lib/print/ui";

type City = { key: string; name_en: string; name_hi: string; region: string };
type Item = {
  id: string; title: string; snippet: string; url: string; image: string | null;
  city: string; cityName: string; cityNameHi: string; category: string;
  publishers: string[]; sourceCount: number; published_at: string;
};

const HOURS = [
  { v: 24, en: "24h", hi: "24 घं" },
  { v: 48, en: "48h", hi: "48 घं" },
  { v: 168, en: "7 days", hi: "7 दिन" },
];

/** Local news by city — from the print desk's own per-city sources (many
 *  publications per city). City × category × time × search. */
export function PrintLocal({ initialCity = "" }: { initialCity?: string }) {
  const { lang } = useLang();
  const hi = lang === "hi";

  const [city, setCity] = useState(initialCity); // ?city= from a dashboard link
  const [category, setCategory] = useState("");
  const [hours, setHours] = useState(48);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // Debounce free-text search so we don't hit the API per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // The request for the current filters; loading = its response hasn't landed.
  const p = new URLSearchParams({ hours: String(hours) });
  if (city) p.set("city", city);
  if (category) p.set("category", category);
  if (qDebounced) p.set("q", qDebounced);
  const reqKey = p.toString();
  const loading = loadedKey !== reqKey;

  useEffect(() => {
    let alive = true; // cleared when filters change, so stale responses are dropped
    fetch(`/api/print/local?${reqKey}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) { setError(j.error ?? "Failed"); return; }
        setError(null);
        setItems(j.items ?? []);
        setTruncated(Boolean(j.truncated));
        setCities(j.cities ?? []);
        setCategories(j.categories ?? []);
      })
      .catch(() => { if (alive) setError("network"); })
      .finally(() => { if (alive) setLoadedKey(reqKey); });
    return () => { alive = false; };
  }, [reqKey]);

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[12px] border transition-colors ${active ? "bg-[var(--red)] text-white border-[var(--red)]" : "bg-white border-[var(--border)] text-[var(--text-2)] hover:border-[var(--red)]"}`;

  const raj = cities.filter((c) => c.region === "rajasthan");
  const metro = cities.filter((c) => c.region !== "rajasthan");

  return (
    <div className="p-6">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "लोकल — शहर के हिसाब से" : "Local — by city"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-4">
        {hi ? "हर शहर के लोकल सोर्स (सभी प्रकाशनों) से ख़बरें। शहर और श्रेणी चुनें, फिर किसी स्टोरी पर 'लिखें'।" : "Stories from each city's local sources (all publications). Pick a city and category, then 'Write' on any story."}
      </p>

      <div className="bg-white border border-[var(--border)] rounded-xl p-3 mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-2)]">
          <MapPin size={13} />
          <select value={city} onChange={(e) => setCity(e.target.value)} className="border border-[var(--border)] rounded px-2 py-1 text-[13px] bg-white outline-none focus:border-[var(--red)] min-w-[180px]">
            <option value="">{hi ? "सभी शहर" : "All cities"}</option>
            {raj.length > 0 && <optgroup label={hi ? "राजस्थान" : "Rajasthan"}>{raj.map((c) => <option key={c.key} value={c.key}>{hi ? c.name_hi : c.name_en}</option>)}</optgroup>}
            {metro.length > 0 && <optgroup label={hi ? "बड़े शहर" : "Metros"}>{metro.map((c) => <option key={c.key} value={c.key}>{hi ? c.name_hi : c.name_en}</option>)}</optgroup>}
          </select>
        </label>
        <div className="flex items-center gap-1">
          {HOURS.map((h) => <button key={h.v} onClick={() => setHours(h.v)} className={chip(hours === h.v)}>{hi ? h.hi : h.en}</button>)}
        </div>
        <label className="flex items-center gap-1.5 flex-1 min-w-[200px] border border-[var(--border)] rounded px-2 py-1">
          <Search size={13} className="text-[var(--text-3)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={hi ? "खोजें…" : "Search…"} className="flex-1 text-[13px] outline-none bg-transparent" />
        </label>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button onClick={() => setCategory("")} className={chip(!category)}>{hi ? "सभी" : "All"}</button>
          {categories.map((c) => <button key={c} onClick={() => setCategory(c === category ? "" : c)} className={chip(category === c)}>{catLabel(c, hi)}</button>)}
        </div>
      )}

      {error && <div className="text-[13px] text-[var(--red)] mb-3">{error === "network" ? (hi ? "नेटवर्क त्रुटि" : "Network error") : error}</div>}

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : items.length === 0 ? (
        <div className="text-[13px] text-[var(--text-3)] py-16 text-center border border-dashed border-[var(--border)] rounded-xl">
          {hi ? "इस फ़िल्टर में कोई स्टोरी नहीं। समय बढ़ाएँ या दूसरा शहर चुनें।" : "No stories for this filter. Widen the time window or pick another city."}
        </div>
      ) : (
        <>
          <div className="text-[11.5px] text-[var(--text-3)] mb-2">
            {items.length} {hi ? "स्टोरीज़" : "stories"}{loading && <Loader2 size={11} className="inline animate-spin ml-1.5" />}
            {truncated && <span className="ml-2 text-[var(--amber,#b45309)]">{hi ? "· सबसे नई स्टोरीज़ दिख रही हैं — पुरानी के लिए शहर चुनें या खोजें।" : "· Showing the newest stories — pick a city or search to reach older ones."}</span>}
          </div>
          <ul className="bg-white border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
            {items.map((s) => (
              <li key={s.id} className="px-4 py-3 flex items-start gap-3">
                {s.image && <img src={s.image} alt="" className="w-16 h-12 object-cover rounded shrink-0 bg-[var(--surface-2)]" loading="lazy" />}
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium leading-snug">{s.title}</div>
                  {s.snippet && <div className="text-[12px] text-[var(--text-2)] mt-0.5 line-clamp-2">{s.snippet}</div>}
                  <div className="text-[11px] text-[var(--text-3)] mt-1 flex items-center gap-2 flex-wrap">
                    <button onClick={() => setCity(s.city)} className="inline-flex items-center gap-0.5 text-[var(--red)] hover:underline"><MapPin size={10} /> {hi ? s.cityNameHi : s.cityName}</button>
                    <button onClick={() => setCategory(s.category)} className="hover:underline">{catLabel(s.category, hi)}</button>
                    <span className="inline-flex items-center gap-1" title={s.publishers.join(", ")}>
                      <Newspaper size={10} /> {s.sourceCount > 1 ? (hi ? `${s.sourceCount} प्रकाशन` : `${s.sourceCount} publications`) : s.publishers[0] || (hi ? "1 प्रकाशन" : "1 publication")}
                    </span>
                    <span className="inline-flex items-center gap-1"><Clock size={10} /> {timeAgo(s.published_at, hi)}</span>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--red)]"><ExternalLink size={10} /> {hi ? "मूल" : "source"}</a>
                  </div>
                </div>
                <Link href={writeHref(s.title, s.snippet, s.url, s.city)} className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--red)] border border-[var(--border)] hover:border-[var(--red)] rounded px-2.5 py-1">
                  <PenSquare size={13} /> {hi ? "लिखें" : "Write"}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
