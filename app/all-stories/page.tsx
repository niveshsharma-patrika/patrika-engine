"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Image as ImageIcon } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Story = {
  title: string;
  sources: number;
  section: string | null;
  url: string | null;
  image: string | null;
  time: string;
};
type Hour = { label: string; isToday: boolean; count: number; stories: Story[] };

function StoryRow({ s, lang }: { s: Story; lang: string }) {
  const [imgOk, setImgOk] = useState(true);
  const cls =
    "flex items-center gap-3.5 px-4 py-2.5 hover:bg-[var(--surface-2)] group transition-colors";
  const inner = (
    <>
      <div className="shrink-0 w-[72px] h-[54px] rounded-md overflow-hidden bg-[var(--surface-2)] grid place-items-center">
        {s.image && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={s.image}
            alt=""
            loading="lazy"
            onError={() => setImgOk(false)}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon size={16} className="text-[var(--text-3)] opacity-40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] leading-snug text-[var(--text)] line-clamp-2 group-hover:text-[var(--red)]">
          {s.title}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--text-3)]">
          <span
            className={`font-mono font-semibold px-1.5 rounded-full ${
              s.sources > 1 ? "bg-[var(--red-soft)] text-[var(--red)]" : "bg-[var(--surface-2)]"
            }`}
            title={`${s.sources} ${s.sources === 1 ? "source" : "sources"}`}
          >
            ×{s.sources}
          </span>
          {s.section && <span className="uppercase tracking-wider truncate">{s.section}</span>}
          <span className="ml-auto font-mono shrink-0">{s.time}</span>
        </div>
      </div>
    </>
  );

  return s.url ? (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default function AllStoriesPage() {
  const { lang } = useLang();
  const [hours, setHours] = useState<Hour[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/all-stories", { cache: "no-store" });
        const d = await r.json();
        if (cancelled) return;
        setHours(Array.isArray(d.hours) ? d.hours : []);
        setTotal(d.totalStories ?? 0);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="pb-4 mb-6 border-b border-[var(--border)]">
        <h1 className="text-2xl font-medium">{lang === "hi" ? "सभी ख़बरें" : "All Stories"}</h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1 max-w-2xl">
          {lang === "hi"
            ? "पिछले 24 घंटे में सभी प्रकाशनों द्वारा कवर की गई हर ख़बर — डुप्लिकेट हटाकर, घंटे के हिसाब से। यह ट्रेंडिंग नहीं, पूरी कवरेज है।"
            : "Every story any publication covered in the last 24 hours — deduplicated, grouped by the hour. Not trending — total coverage."}
          {state === "ready" ? ` · ${total.toLocaleString()} ${lang === "hi" ? "ख़बरें" : "stories"}` : ""}
        </p>
      </div>

      {state === "loading" && (
        <div className="text-sm text-[var(--text-3)]">{lang === "hi" ? "लोड हो रहा है…" : "Loading…"}</div>
      )}
      {state === "error" && (
        <div className="text-sm text-[var(--red)]">{lang === "hi" ? "लोड नहीं हो सका।" : "Could not load."}</div>
      )}
      {state === "ready" && hours.length === 0 && (
        <div className="border border-dashed border-[var(--border)] rounded-lg p-12 text-center text-[14px] text-[var(--text-2)]">
          {lang === "hi" ? "अभी कोई ख़बर नहीं — अगली इनजेस्ट इसे भरेगी।" : "No stories yet — the next ingest will fill this."}
        </div>
      )}

      <div className="space-y-2.5 max-w-4xl">
        {hours.map((h, i) => {
          const isOpen = open[i] ?? false;
          return (
            <div key={i} className="border border-[var(--border)] rounded-lg overflow-hidden bg-white">
              <button
                onClick={() => setOpen((p) => ({ ...p, [i]: !isOpen }))}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-[var(--surface-2)] transition-colors"
              >
                {isOpen ? (
                  <ChevronDown size={16} className="text-[var(--text-3)]" />
                ) : (
                  <ChevronRight size={16} className="text-[var(--text-3)]" />
                )}
                <span className="text-[15px] font-semibold">{h.label}</span>
                {!h.isToday && (
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">
                    {lang === "hi" ? "बीता दिन" : "prev day"}
                  </span>
                )}
                <span className="ml-auto text-[12px] text-[var(--text-3)]">
                  {h.count} {lang === "hi" ? "ख़बरें" : "stories"}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                  {h.stories.map((s, j) => (
                    <StoryRow key={j} s={s} lang={lang} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
