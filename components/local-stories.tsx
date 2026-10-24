"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, PenSquare, ExternalLink, MapPin, Clock } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Story = {
  id: string; title: string; snippet: string; url: string;
  source_name: string; focus: string; desk: string | null;
  location: string; category: string; image: string | null; published_at: string; sourceCount: number;
};
type Facets = { items: Story[]; sources: { id: string; name: string; focus: string }[]; locations: string[]; categories: string[] };

const HOURS = [
  { v: 24, en: "24h", hi: "24घं" },
  { v: 48, en: "48h", hi: "48घं" },
  { v: 168, en: "7 days", hi: "7 दिन" },
];

/** Classifier category → display label. */
const CAT: Record<string, { en: string; hi: string }> = {
  crime: { en: "Crime", hi: "अपराध" },
  politics: { en: "Politics / Govt", hi: "राजनीति / सरकार" },
  courts: { en: "Courts", hi: "अदालत" },
  national: { en: "National", hi: "राष्ट्रीय" },
  world: { en: "World", hi: "दुनिया" },
  business: { en: "Business", hi: "बिज़नेस" },
  sports: { en: "Sports", hi: "खेल" },
  entertainment: { en: "Entertainment", hi: "मनोरंजन" },
  health: { en: "Health", hi: "स्वास्थ्य" },
  education: { en: "Education", hi: "शिक्षा" },
  technology: { en: "Tech", hi: "टेक" },
};
const catLabel = (k: string, hi: boolean) => (CAT[k] ? (hi ? CAT[k].hi : CAT[k].en) : k);

function timeLabel(ts: string, hi: boolean): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return "";
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return hi ? `${min} मि` : `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return hi ? `${h} घं` : `${h}h`;
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
}

export function LocalStories() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const router = useRouter();

  const [source, setSource] = useState("");
  const [local, setLocal] = useState(false);
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [hours, setHours] = useState(24);
  const [q, setQ] = useState("");

  const [data, setData] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(true);
  const runRef = useRef(0);

  const load = useCallback(async () => {
    const run = ++runRef.current;
    setLoading(true);
    try {
      const p = new URLSearchParams({ hours: String(hours) });
      if (source) p.set("source", source);
      if (local) p.set("local", "1");
      if (location) p.set("location", location);
      if (category) p.set("category", category);
      const r = await fetch(`/api/print/local-stories?${p.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (runRef.current !== run) return; // a newer filter change superseded this
      setData(r.ok ? j : { items: [], sources: j.sources ?? [], locations: j.locations ?? [], categories: j.categories ?? [] });
    } catch {
      if (runRef.current === run) setData({ items: [], sources: [], locations: [], categories: [] });
    } finally {
      if (runRef.current === run) setLoading(false);
    }
  }, [source, local, location, category, hours]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const items = data?.items ?? [];
    const query = q.trim().toLowerCase();
    const list = query ? items.filter((s) => `${s.title} ${s.snippet} ${s.source_name}`.toLowerCase().includes(query)) : items;
    return [...list].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  }, [data, q]);

  const selectCls = "bg-white border border-[var(--border)] text-[13px] px-2.5 py-1.5 rounded outline-none focus:border-[var(--red)]";

  return (
    <div className="p-6">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "लोकल ख़बरें" : "Local Stories"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-4">
        {hi ? "लाइव सोर्स से ख़बरें — सोर्स, कैटेगरी और समय से छाँटें। किसी पर 'लिखें' दबाकर स्टोरी तैयार करें।" : "Stories from live sources — filter by source, category and time. Hit 'Write' on any to draft it."}
      </p>

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select value={source} onChange={(e) => setSource(e.target.value)} className={selectCls} aria-label={hi ? "सोर्स" : "Source"}>
          <option value="">{hi ? "सभी सोर्स" : "All sources"}</option>
          {(data?.sources ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls} aria-label={hi ? "कैटेगरी" : "Category"}>
          <option value="">{hi ? "सभी कैटेगरी" : "All categories"}</option>
          {(data?.categories ?? []).map((c) => <option key={c} value={c}>{catLabel(c, hi)}</option>)}
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)} className={selectCls} aria-label={hi ? "लोकेशन" : "Location"}>
          <option value="">{hi ? "सभी लोकेशन" : "All locations"}</option>
          {(data?.locations ?? []).map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="flex items-center gap-1">
          {HOURS.map((h) => (
            <button key={h.v} onClick={() => setHours(h.v)}
              className={`text-[12px] font-medium px-2.5 py-1.5 rounded border transition-colors ${hours === h.v ? "bg-[var(--surface-2)] border-[var(--red)] text-[var(--text)]" : "bg-white border-[var(--border)] text-[var(--text-3)] hover:border-[var(--red)]"}`}>
              {hi ? h.hi : h.en}
            </button>
          ))}
        </div>
        <button onClick={() => setLocal((v) => !v)}
          className={`text-[12px] font-medium px-2.5 py-1.5 rounded border inline-flex items-center gap-1 transition-colors ${local ? "bg-[var(--red-soft)] border-[var(--red)] text-[var(--red)]" : "bg-white border-[var(--border)] text-[var(--text-3)] hover:border-[var(--red)]"}`}
          title={hi ? "केवल क्षेत्रीय (रीजनल) सोर्स" : "Regional-focus sources only"}>
          <MapPin size={12} /> {hi ? "लोकल" : "Local"}
        </button>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={hi ? "खोजें…" : "Search…"} className={`${selectCls} pl-8 w-[200px]`} />
        </div>
        {!loading && <span className="text-[12px] text-[var(--text-3)] ml-auto">{shown.length} {hi ? "ख़बरें" : "stories"}</span>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : shown.length === 0 ? (
        <div className="text-[13px] text-[var(--text-3)] py-16 text-center">{hi ? "इन फ़िल्टर के लिए कोई ख़बर नहीं मिली।" : "No stories for these filters."}</div>
      ) : (
        <ul className="space-y-2">
          {shown.map((s) => (
            <li key={s.id} className="bg-white border border-[var(--border)] rounded-lg p-3 flex items-start gap-3">
              {s.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt="" loading="lazy" className="w-20 h-20 object-cover rounded shrink-0 bg-[var(--surface-2)]" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-[var(--text)] leading-snug">{s.title}</div>
                {s.snippet && <div className="text-[12px] text-[var(--text-2)] mt-1 leading-snug line-clamp-2">{s.snippet}</div>}
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-[var(--text-3)] flex-wrap">
                  <span className="font-medium text-[var(--text-2)]">{s.source_name}</span>
                  {s.category && <span className="bg-[var(--red-soft)] text-[var(--red)] px-1.5 py-0.5 rounded font-medium">{catLabel(s.category, hi)}</span>}
                  {s.location && <span className="inline-flex items-center gap-0.5 text-[var(--text-2)]"><MapPin size={10} /> {s.location}</span>}
                  {s.sourceCount > 1 && <span>×{s.sourceCount} {hi ? "सोर्स" : "sources"}</span>}
                  <span className="inline-flex items-center gap-1"><Clock size={10} /> {timeLabel(s.published_at, hi)}</span>
                  {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[var(--text-3)] hover:text-[var(--red)]"><ExternalLink size={10} /> {hi ? "मूल" : "original"}</a>}
                </div>
              </div>
              <button onClick={() => router.push(`/print/write?title=${encodeURIComponent(s.title)}`)}
                className="shrink-0 self-center bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[12px] font-medium px-3 py-1.5 rounded flex items-center gap-1.5">
                <PenSquare size={12} /> {hi ? "लिखें" : "Write"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
