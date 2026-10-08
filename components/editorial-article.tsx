"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle, ImageOff, Clock, User, Tag } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type DetailItem = {
  id: string;
  heading: string;
  img: string;
  desk: string;
  storyType: string;
  author: string;
  pubDate: string;
  description: string;
  keyword: string;
};

/** Strip editorial-system typesetting artifacts (RTF \B toggles, <bha> markers)
 *  so the plain-text body reads cleanly. */
function cleanBody(raw: string): string {
  return raw
    .replace(/<\/?[a-zA-Z]{1,8}>/g, "") // <bha> … </bha> and similar short markers
    .replace(/\\B/g, "") // RTF bold toggles
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function fullTime(pubDate: string): string {
  const t = Date.parse(pubDate);
  if (Number.isNaN(t)) return pubDate;
  return new Date(t).toLocaleString([], {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function EditorialArticle({ id, date }: { id: string; date: string }) {
  const { lang } = useLang();
  const hi = lang === "hi";
  const router = useRouter();

  const [item, setItem] = useState<DetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/editorial-feed/item?date=${encodeURIComponent(date)}&id=${encodeURIComponent(id)}`,
          { cache: "no-store" }
        );
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setError(j.error ?? "Failed to load");
        else setItem(j.item as DetailItem);
      } catch {
        if (alive) setError(hi ? "नेटवर्क त्रुटि" : "Network error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, date, hi]);

  const backHref = `/editorial-feed${date ? `?date=${encodeURIComponent(date)}` : ""}`;
  const keywords = item?.keyword ? item.keyword.split(/[,;]/).map((k) => k.trim()).filter(Boolean) : [];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button
        onClick={() => router.push(backHref)}
        className="flex items-center gap-1.5 text-[13px] text-[var(--text-3)] hover:text-[var(--text)] mb-5"
      >
        <ArrowLeft size={15} /> {hi ? "फ़ीड पर वापस" : "Back to feed"}
      </button>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--red)] py-16 justify-center">
          <AlertCircle size={16} /> {error}
        </div>
      ) : item ? (
        <article>
          <h1 className="text-[24px] font-semibold text-[var(--text)] leading-tight mb-3">
            {item.heading || (hi ? "(शीर्षक नहीं)" : "(untitled)")}
          </h1>

          <div className="flex items-center gap-3 flex-wrap text-[12px] text-[var(--text-3)] mb-5">
            {item.desk && <span className="bg-[var(--surface-2)] px-2 py-0.5 rounded font-medium text-[var(--text-2)]">{item.desk}</span>}
            {item.storyType && <span className="inline-flex items-center gap-1"><Tag size={12} /> {item.storyType}</span>}
            {item.author && <span className="inline-flex items-center gap-1"><User size={12} /> {item.author}</span>}
            {item.pubDate && <span className="inline-flex items-center gap-1"><Clock size={12} /> {fullTime(item.pubDate)}</span>}
          </div>

          {item.img && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.img}
              alt={item.heading}
              onError={() => setImgFailed(true)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] mb-5 object-cover"
            />
          ) : item.img ? (
            <div className="w-full aspect-[16/9] rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-3)] mb-5">
              <ImageOff size={24} />
            </div>
          ) : null}

          <div className="text-[15px] text-[var(--text)] leading-relaxed whitespace-pre-wrap">
            {cleanBody(item.description) || (hi ? "(कोई विवरण नहीं)" : "(no body)")}
          </div>

          {keywords.length > 0 && (
            <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-center gap-2 flex-wrap">
              <span className="text-[12px] text-[var(--text-3)]">{hi ? "कीवर्ड:" : "Keywords:"}</span>
              {keywords.map((k, i) => (
                <span key={i} className="text-[12px] bg-[var(--surface-2)] text-[var(--text-2)] px-2 py-0.5 rounded">{k}</span>
              ))}
            </div>
          )}
        </article>
      ) : null}
    </div>
  );
}
