"use client";

import { useEffect, useState } from "react";

import { useLang } from "@/lib/i18n/context";

type Item = {
  author: string;
  text: string;
  ageMin: number;
  isWatchlist: boolean;
  url: string | null;
};

export function LiveTicker({ label }: { label: string }) {
  const { lang } = useLang();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const r = await fetch(`/api/signals/recent?lang=${lang}`, { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { items: Item[] };
        if (!stop && Array.isArray(json.items)) {
          setItems(json.items);
        }
      } catch {
        /* ignore */
      }
    }
    load();
    // refresh every 90s; cheaper because Hindi translations are cached
    const id = setInterval(load, 90_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [lang]);

  if (items.length === 0) {
    return (
      <div className="flex items-center h-9 bg-[var(--text)] text-white overflow-hidden">
        <div className="bg-[var(--red)] text-white text-[11px] tracking-widest uppercase font-medium px-4 h-9 grid place-items-center shrink-0">
          {label}
        </div>
        <div className="flex-1 pl-8 text-[12px] text-white/60">
          {lang === "hi" ? "ताज़ा सिग्नल लोड हो रहे हैं…" : "Loading recent signals…"}
        </div>
      </div>
    );
  }

  // Two copies for seamless infinite scroll
  const duped = [...items, ...items];

  return (
    <div className="flex items-center h-9 bg-[var(--text)] text-white overflow-hidden">
      <div className="bg-[var(--red)] text-white text-[11px] tracking-widest uppercase font-medium px-4 h-9 grid place-items-center shrink-0">
        {label}
      </div>
      <div className="flex-1 overflow-hidden h-9 flex items-center">
        <div
          className="flex gap-12 whitespace-nowrap pl-8 text-[13px]"
          style={{ animation: "scroll-x 120s linear infinite" }}
        >
          {duped.map((item, i) => (
            <span
              key={i}
              className={item.isWatchlist ? "text-white" : "text-white/85"}
            >
              {item.isWatchlist && (
                <span className="font-mono text-[10px] tracking-wider bg-[var(--red)] text-white px-1.5 py-0.5 rounded-[3px] mr-2">
                  WATCH
                </span>
              )}
              <b className="font-medium text-white">{item.author}</b>{" "}
              {item.text}{" "}
              <span className="font-mono text-[11px] text-white/50">
                {item.ageMin < 60 ? `${item.ageMin}m` : `${Math.round(item.ageMin / 60)}h`}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
