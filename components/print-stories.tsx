"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, PenSquare, ExternalLink, MapPin, Clock, Globe2, Building2 } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { CITY_HI } from "@/lib/geo/cities";

type Story = {
  id: string; title: string; titleHi: string; snippet: string; url: string | null; image: string | null;
  city: string; category: string; source: string; scope: string; published_at: string; sourceCount: number;
};
type Data = { items: Story[]; cities: string[]; categories: string[] };

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
const cityLabel = (c: string, hi: boolean) => (hi && CITY_HI[c] ? CITY_HI[c] : c);

function timeLabel(ts: string, hi: boolean): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return "";
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return hi ? `${min} मि` : `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return hi ? `${h} घं` : `${h}h`;
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
}

export function PrintStories() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const router = useRouter();

  const [scope, setScope] = useState<"national" | "local">("national");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const runRef = useRef(0);

  const load = useCallback(async () => {
    const run = ++runRef.current;
    setLoading(true);
    try {
      const p = new URLSearchParams({ scope, hours: "48" });
      if (city) p.set("city", city);
      if (category) p.set("category", category);
      if (q.trim()) p.set("q", q.trim());
      const r = await fetch(`/api/print/stories?${p.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (runRef.current !== run) return;
      setData(r.ok ? j : { items: [], cities: [], categories: [] });
    } catch {
      if (runRef.current === run) setData({ items: [], cities: [], categories: [] });
    } finally {
      if (runRef.current === run) setLoading(false);
    }
  }, [scope, city, category, q]);
  useEffect(() => { load(); }, [load]);
  // Reset filters when the scope changes.
  useEffect(() => { setCity(""); setCategory(""); setQ(""); }, [scope]);

  function write(s: Story) {
    const title = hi ? s.titleHi || s.title : s.title;
    const p = new URLSearchParams({ title });
    if (s.snippet) p.set("summary", s.snippet);
    if (s.url) p.set("url", s.url);
    router.push(`/print/write?${p.toString()}`);
  }

  const selectCls = "bg-white border border-[var(--border)] text-[13px] px-2.5 py-1.5 rounded outline-none focus:border-[var(--red)]";
  const items = data?.items ?? [];

  return (
    <div className="p-6">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "स्टोरीज़" : "Stories"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-4">
        {hi ? "राष्ट्रीय और लोकल ख़बरें — शहर और कैटेगरी से छाँटें। किसी पर 'लिखें' दबाकर रिसर्च के साथ स्टोरी तैयार करें।" : "National + local stories — filter by city and category. Hit 'Write' on any to research + draft it."}
      </p>

      {/* Scope + filters */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="flex items-center gap-1 bg-white border border-[var(--border)] rounded-lg p-0.5">
          {([["national", Globe2, hi ? "राष्ट्रीय" : "National"], ["local", Building2, hi ? "लोकल" : "Local"]] as const).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setScope(k)}
              className={`text-[13px] font-medium px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors ${scope === k ? "bg-[var(--red)] text-white" : "text-[var(--text-2)] hover:bg-[var(--surface-2)]"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <select value={city} onChange={(e) => setCity(e.target.value)} className={selectCls} aria-label={hi ? "शहर" : "City"}>
          <option value="">{hi ? "सभी शहर" : "All cities"}</option>
          {(data?.cities ?? []).map((c) => <option key={c} value={c}>{cityLabel(c, hi)}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls} aria-label={hi ? "कैटेगरी" : "Category"}>
          <option value="">{hi ? "सभी कैटेगरी" : "All categories"}</option>
          {(data?.categories ?? []).map((c) => <option key={c} value={c}>{catLabel(c, hi)}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={hi ? "खोजें…" : "Search…"} className={`${selectCls} pl-8 w-[200px]`} />
        </div>
        {!loading && <span className="text-[12px] text-[var(--text-3)] ml-auto">{items.length} {hi ? "ख़बरें" : "stories"}</span>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : items.length === 0 ? (
        <div className="text-[13px] text-[var(--text-3)] py-16 text-center">{hi ? "इन फ़िल्टर के लिए कोई ख़बर नहीं मिली।" : "No stories for these filters."}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.id} className="bg-white border border-[var(--border)] rounded-lg p-3 flex items-start gap-3">
              {s.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt="" loading="lazy" className="w-20 h-20 object-cover rounded shrink-0 bg-[var(--surface-2)]" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-[var(--text)] leading-snug">{hi ? s.titleHi || s.title : s.title}</div>
                {s.snippet && <div className="text-[12px] text-[var(--text-2)] mt-1 leading-snug line-clamp-2">{s.snippet}</div>}
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-[var(--text-3)] flex-wrap">
                  {s.category && <span className="bg-[var(--red-soft)] text-[var(--red)] px-1.5 py-0.5 rounded font-medium">{catLabel(s.category, hi)}</span>}
                  {s.city && <span className="inline-flex items-center gap-0.5 text-[var(--text-2)]"><MapPin size={10} /> {cityLabel(s.city, hi)}</span>}
                  {s.source && <span className="font-medium text-[var(--text-2)]">{s.source}</span>}
                  {s.sourceCount > 1 && <span>×{s.sourceCount} {hi ? "सोर्स" : "sources"}</span>}
                  <span className="inline-flex items-center gap-1"><Clock size={10} /> {timeLabel(s.published_at, hi)}</span>
                  {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[var(--text-3)] hover:text-[var(--red)]"><ExternalLink size={10} /> {hi ? "मूल" : "original"}</a>}
                </div>
              </div>
              <button onClick={() => write(s)}
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
