"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Newspaper, Loader2, Search, AlertCircle, ImageOff } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type ListItem = {
  id: string;
  heading: string;
  img: string;
  desk: string;
  storyType: string;
  author: string;
  pubDate: string;
};

type FeedResponse = {
  date: string;
  count: number;
  items: ListItem[];
  desks: string[];
  storyTypes: string[];
};

const PAGE_SIZE = 48;

function timeLabel(pubDate: string): string {
  const t = Date.parse(pubDate);
  if (Number.isNaN(t)) return pubDate;
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function EditorialFeed({ initialDate }: { initialDate: string }) {
  const { lang } = useLang();
  const hi = lang === "hi";

  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [desk, setDesk] = useState("");
  const [storyType, setStoryType] = useState("");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  // `hi` is intentionally NOT a dependency: it only localises the network-error
  // message (handled at render via the "__net__" sentinel), so keeping it out
  // stops a language toggle from refetching the whole feed.
  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/editorial-feed?date=${encodeURIComponent(d)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Failed to load");
        setData(null);
      } else {
        // Reset filters + paging in the same commit as the new data so stale
        // filters never apply to the new day for a frame.
        setDesk(""); setStoryType(""); setQuery(""); setVisible(PAGE_SIZE);
        setData(j as FeedResponse);
      }
    } catch {
      setError("__net__");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  // Keep the URL's ?date= in sync so returning from an article restores the day.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    window.history.replaceState(null, "", url.toString());
  }, [date]);

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (desk && it.desk !== desk) return false;
      if (storyType && it.storyType !== storyType) return false;
      if (q) {
        const hay = `${it.heading} ${it.author} ${it.desk} ${it.storyType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, desk, storyType, query]);

  const shown = filtered.slice(0, visible);

  const selectCls =
    "bg-white border border-[var(--border)] text-[13px] px-2.5 py-1.5 rounded outline-none focus:border-[var(--purple)]";

  return (
    <div className="p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <Newspaper size={20} className="text-[var(--purple)]" />
        <h1 className="text-[20px] font-semibold text-[var(--text)]">{hi ? "एडिटोरियल फ़ीड" : "Editorial Feed"}</h1>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi
          ? "editorialreview.patrika.com की ख़बरें — तारीख़, डेस्क और स्टोरी टाइप से फ़िल्टर करें। किसी ख़बर पर टैप करके पूरा विवरण देखें।"
          : "News from editorialreview.patrika.com — filter by date, desk and story type. Tap any story for the full detail."}
      </p>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className={selectCls}
          aria-label={hi ? "तारीख़" : "Date"}
        />
        <select value={desk} onChange={(e) => setDesk(e.target.value)} className={selectCls} aria-label={hi ? "डेस्क" : "Desk"}>
          <option value="">{hi ? "सभी डेस्क" : "All desks"}</option>
          {(data?.desks ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={storyType} onChange={(e) => setStoryType(e.target.value)} className={selectCls} aria-label={hi ? "स्टोरी टाइप" : "Story type"}>
          <option value="">{hi ? "सभी स्टोरी टाइप" : "All story types"}</option>
          {(data?.storyTypes ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={hi ? "खोजें…" : "Search…"}
            className={`${selectCls} pl-8 w-[220px]`}
          />
        </div>
        {!loading && data && (
          <span className="text-[12px] text-[var(--text-3)] ml-auto">
            {filtered.length.toLocaleString()} {hi ? "ख़बरें" : "stories"}
            {filtered.length !== data.count && <> · {data.count.toLocaleString()} {hi ? "कुल" : "total"}</>}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--red)] py-16 justify-center">
          <AlertCircle size={16} /> {error === "__net__" ? (hi ? "नेटवर्क त्रुटि" : "Network error") : error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-[13px] text-[var(--text-3)] py-16 text-center">
          {hi ? "इस दिन/फ़िल्टर के लिए कोई ख़बर नहीं मिली।" : "No stories for this day / filter."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {shown.map((it) => (
              <Link
                key={it.id}
                href={`/editorial-feed/${encodeURIComponent(it.id)}?date=${encodeURIComponent(date)}`}
                className="group bg-white border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--purple)] hover:shadow-sm transition-colors flex flex-col"
              >
                <FeedThumb src={it.img} alt={it.heading} />
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <h3 className="text-[13.5px] font-medium text-[var(--text)] leading-snug line-clamp-3 group-hover:text-[var(--purple)]">
                    {it.heading || (hi ? "(शीर्षक नहीं)" : "(untitled)")}
                  </h3>
                  <div className="mt-auto flex items-center gap-1.5 flex-wrap text-[11px] text-[var(--text-3)]">
                    {it.desk && <span className="bg-[var(--surface-2)] px-1.5 py-0.5 rounded font-medium text-[var(--text-2)]">{it.desk}</span>}
                    {it.storyType && <span>{it.storyType}</span>}
                    {it.pubDate && <span className="ml-auto">{timeLabel(it.pubDate)}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {visible < filtered.length && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="bg-white border border-[var(--border)] hover:border-[var(--purple)] text-[13px] font-medium px-5 py-2 rounded"
              >
                {hi ? "और दिखाएँ" : "Load more"} ({(filtered.length - visible).toLocaleString()})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Thumbnail that degrades to a neutral placeholder if the image fails. */
function FeedThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="aspect-[16/10] bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-3)]">
        <ImageOff size={22} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-[16/10] w-full object-cover bg-[var(--surface-2)]"
    />
  );
}
