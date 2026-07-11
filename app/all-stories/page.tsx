"use client";

import { useEffect, useState } from "react";

import { useLang } from "@/lib/i18n/context";

type Story = { title: string; sources: number; section: string | null; url: string | null; time: string };
type Hour = { label: string; isToday: boolean; count: number; stories: Story[] };

export default function AllStoriesPage() {
  const { lang } = useLang();
  const [hours, setHours] = useState<Hour[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

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
            ? "पिछले 24 घंटे में सभी प्रकाशनों द्वारा कवर की गई हर ख़बर — डुप्लिकेट हटाकर, घंटे के हिसाब से। यह ट्रेंडिंग नहीं है, पूरी कवरेज है।"
            : "Every story any publication covered in the last 24 hours — deduplicated, by the hour. Not trending — total coverage."}
          {state === "ready" ? ` · ${total} ${lang === "hi" ? "ख़बरें" : "stories"}` : ""}
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

      <div className="space-y-6 max-w-3xl">
        {hours.map((h, i) => (
          <section key={i}>
            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="text-[15px] font-semibold">{h.label}</h2>
              {!h.isToday && (
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">
                  {lang === "hi" ? "बीता दिन" : "prev day"}
                </span>
              )}
              <span className="text-[12px] text-[var(--text-3)]">
                {h.count} {lang === "hi" ? "ख़बरें" : "stories"}
              </span>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-md divide-y divide-[var(--border)]">
              {h.stories.map((s, j) => (
                <div key={j} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={`shrink-0 min-w-9 text-center font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                      s.sources > 1 ? "bg-[var(--red-soft)] text-[var(--red)]" : "bg-[var(--surface-2)] text-[var(--text-3)]"
                    }`}
                    title={`${s.sources} ${s.sources === 1 ? "source" : "sources"}`}
                  >
                    ×{s.sources}
                  </span>
                  <div className="min-w-0 flex-1">
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13.5px] text-[var(--text)] hover:text-[var(--red)] hover:underline line-clamp-2"
                      >
                        {s.title}
                      </a>
                    ) : (
                      <span className="text-[13.5px] text-[var(--text)] line-clamp-2">{s.title}</span>
                    )}
                  </div>
                  {s.section && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--text-3)] hidden sm:inline">
                      {s.section}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-[var(--text-3)]">{s.time}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
