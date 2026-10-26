"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, PenSquare, Flame, MapPin, ArrowRight, Clock } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { catLabel, timeAgo, writeHref } from "@/lib/print/ui";

type Trend = { id?: string; uid?: string; title: string; title_hi?: string; section?: string; signalCount?: number; lastSeenMinAgo?: number };
const tkey = (t: Trend) => t.uid ?? t.id ?? t.title;

function Section({ title, href, icon, hi, children }: { title: string; href: string; icon: React.ReactNode; hi: boolean; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold flex items-center gap-1.5">{icon} {title}</h2>
        <Link href={href} className="text-[12px] text-[var(--red)] hover:underline inline-flex items-center gap-1">{hi ? "सभी देखें" : "See all"} <ArrowRight size={12} /></Link>
      </div>
      {children}
    </section>
  );
}
type Local = { id: string; title: string; snippet: string; url: string; city: string; cityName: string; cityNameHi: string; category: string; sourceCount: number; published_at: string };

/** Print desk home: a glance at what's hot nationally + what local sources are carrying. */
export function PrintDashboard() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const [national, setNational] = useState<Trend[]>([]);
  const [local, setLocal] = useState<Local[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [b, t, l] = await Promise.all([
          fetch("/api/trends?window=breaking", { cache: "no-store" }).then((r) => r.json()).catch(() => []),
          fetch("/api/trends?window=trending", { cache: "no-store" }).then((r) => r.json()).catch(() => []),
          fetch("/api/print/local?hours=24", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ items: [] })),
        ]);
        if (!alive) return;
        const seen = new Set<string>();
        const nat = [...(Array.isArray(b) ? b : b.trends ?? []), ...(Array.isArray(t) ? t : t.trends ?? [])].filter((x: Trend) => {
          const k = tkey(x); if (seen.has(k)) return false; seen.add(k); return true;
        });
        setNational(nat.slice(0, 12));
        setLocal((l.items ?? []).slice(0, 12));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "आज की नज़र" : "Today at a glance"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-5">{hi ? "राष्ट्रीय ट्रेंड और आपके शहरों की लोकल ख़बरें — किसी पर 'लिखें' दबाएँ।" : "National trends and local news from your cities — hit 'Write' on any."}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Section title={hi ? "राष्ट्रीय — ब्रेकिंग और ट्रेंडिंग" : "National — breaking & trending"} href="/print/national" hi={hi} icon={<Flame size={15} className="text-[var(--red)]" />}>
            {national.length === 0 ? <div className="text-[12px] text-[var(--text-3)] py-6 text-center">{hi ? "अभी कुछ नहीं" : "Nothing right now"}</div> : (
              <ul className="space-y-1.5">
                {national.map((t) => (
                  <li key={tkey(t)} className="flex items-start gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium leading-snug">{hi ? t.title_hi || t.title : t.title}</div>
                      <div className="text-[11px] text-[var(--text-3)] mt-0.5 flex gap-2">{t.section && <span>{catLabel(t.section, hi)}</span>}{t.signalCount != null && <span>{t.signalCount} {hi ? "स्रोत" : "sources"}</span>}</div>
                    </div>
                    <Link href={writeHref(hi ? t.title_hi || t.title : t.title)} className="shrink-0 text-[var(--red)] hover:bg-[var(--red-soft)] rounded p-1" title={hi ? "लिखें" : "Write"}><PenSquare size={14} /></Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={hi ? "लोकल — आपके शहरों से" : "Local — from your cities"} href="/print/local" hi={hi} icon={<MapPin size={15} className="text-[var(--red)]" />}>
            {local.length === 0 ? <div className="text-[12px] text-[var(--text-3)] py-6 text-center">{hi ? "लोकल सोर्स से अभी ख़बरें नहीं आईं — इंजेस्ट चलने दें।" : "No local stories yet — let ingestion run."}</div> : (
              <ul className="space-y-1.5">
                {local.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium leading-snug">{s.title}</div>
                      <div className="text-[11px] text-[var(--text-3)] mt-0.5 flex gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-0.5 text-[var(--text-2)]"><MapPin size={10} /> {hi ? s.cityNameHi : s.cityName}</span>
                        <span>{catLabel(s.category, hi)}</span>
                        {s.sourceCount > 1 && <span>×{s.sourceCount}</span>}
                        <span className="inline-flex items-center gap-1"><Clock size={10} /> {timeAgo(s.published_at, hi)}</span>
                      </div>
                    </div>
                    <Link href={writeHref(s.title, s.snippet, s.url, s.city)} className="shrink-0 text-[var(--red)] hover:bg-[var(--red-soft)] rounded p-1" title={hi ? "लिखें" : "Write"}><PenSquare size={14} /></Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
