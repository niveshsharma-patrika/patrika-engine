"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenSquare, Flame, TrendingUp, Clock } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Trend = {
  uid: string;
  section: string;
  tag?: string;
  title: string;
  title_hi?: string;
  signalCount?: number;
  lastSeenMinAgo?: number;
  image?: string | null;
};

const WINDOWS = [
  { key: "breaking", en: "Breaking", hi: "ब्रेकिंग", Icon: Flame },
  { key: "trending", en: "Trending", hi: "ट्रेंडिंग", Icon: TrendingUp },
] as const;

function ago(min?: number, hi?: boolean): string {
  if (min == null) return "";
  if (min < 60) return hi ? `${min} मि पहले` : `${min}m ago`;
  const h = Math.round(min / 60);
  return hi ? `${h} घं पहले` : `${h}h ago`;
}

export function PrintDashboard() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const router = useRouter();

  const [data, setData] = useState<Record<string, Trend[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const out: Record<string, Trend[]> = {};
        await Promise.all(
          WINDOWS.map(async (w) => {
            const r = await fetch(`/api/trends?window=${w.key}`, { cache: "no-store" });
            const j = await r.json();
            out[w.key] = Array.isArray(j) ? j : j.trends ?? [];
          })
        );
        if (alive) setData(out);
      } catch {
        /* advisory */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  function write(t: Trend) {
    const title = hi ? t.title_hi || t.title : t.title;
    router.push(`/print/write?title=${encodeURIComponent(title)}`);
  }

  return (
    <div className="p-6">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "आज क्या हो रहा है" : "What's happening"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi ? "लाइव सोर्स से ताज़ा ख़बरें — किसी पर 'लिखें' दबाकर स्टोरी तैयार करें।" : "Fresh stories from live sources — hit 'Write' on any to draft it."}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {WINDOWS.map((w) => {
            const items = data[w.key] ?? [];
            return (
              <section key={w.key}>
                <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-semibold text-[var(--text-2)]">
                  <w.Icon size={15} className="text-[var(--red)]" /> {hi ? w.hi : w.en}
                  <span className="text-[var(--text-3)] font-normal">({items.length})</span>
                </div>
                {items.length === 0 ? (
                  <div className="text-[12px] text-[var(--text-3)] border border-dashed border-[var(--border)] rounded-lg p-6 text-center">
                    {hi ? "अभी कुछ नहीं" : "Nothing right now"}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {items.slice(0, 14).map((t) => (
                      <li key={t.uid} className="group bg-white border border-[var(--border)] rounded-lg p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-medium text-[var(--text)] leading-snug">{hi ? t.title_hi || t.title : t.title}</div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--text-3)]">
                            {t.section && <span className="bg-[var(--surface-2)] px-1.5 py-0.5 rounded font-medium text-[var(--text-2)]">{t.section}</span>}
                            {t.signalCount != null && <span>{t.signalCount} {hi ? "स्रोत" : "sources"}</span>}
                            {t.lastSeenMinAgo != null && <span className="inline-flex items-center gap-1"><Clock size={11} /> {ago(t.lastSeenMinAgo, hi)}</span>}
                          </div>
                        </div>
                        <button onClick={() => write(t)}
                          className="shrink-0 self-center bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[12px] font-medium px-3 py-1.5 rounded flex items-center gap-1.5">
                          <PenSquare size={12} /> {hi ? "लिखें" : "Write"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
