"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";

type Entry = {
  sign: string; nameHi: string; nameEn: string;
  forecast: string; shubhRang: string; shubhAnk: string; shubhSamay: string;
  colorCode: string; mood: string; solution: string; zodiacContent: string; luckyLetters: string;
};
type Lang = "hi" | "en";
type Data = {
  date: string; today: string; lang: Lang; count: number;
  wpStatus: "none" | "pushed" | "failed" | "skipped" | "pending";
  wpError: string | null; updatedAt: string | null; entries: Entry[];
};

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString("hi-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

// Pure calendar arithmetic in UTC, so a day-shift is DST-immune in any browser tz.
const shiftDate = (d: string, days: number) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + days)).toISOString().slice(0, 10);
};

const WP_BADGE: Record<Data["wpStatus"], { label: string; cls: string }> = {
  pushed:  { label: "WordPress पर प्रकाशित", cls: "bg-[var(--green-soft)] text-[var(--green)]" },
  failed:  { label: "WordPress पुश विफल",    cls: "bg-[var(--red-soft)] text-[var(--red)]" },
  skipped: { label: "WordPress सेट नहीं",     cls: "bg-[var(--orange-soft)] text-[var(--orange)]" },
  pending: { label: "पुश बाकी",              cls: "bg-[var(--surface-2)] text-[var(--text-2)]" },
  none:    { label: "तैयार नहीं",             cls: "bg-[var(--surface-2)] text-[var(--text-3)]" },
};

export function HoroscopeView({ isAdmin }: { isAdmin: boolean }) {
  const [date, setDate] = useState<string>("");
  const [lang, setLang] = useState<Lang>("hi");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<null | "regenerate" | "repush">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Refs so load() can stay a stable callback while still defaulting to the
  // currently-shown date/language.
  const langRef = useRef<Lang>("hi");
  const dateRef = useRef<string>("");

  const load = useCallback(async (d?: string, l?: Lang) => {
    setLoading(true);
    const useLang = l ?? langRef.current;
    try {
      const params = new URLSearchParams({ lang: useLang });
      if (d) params.set("date", d);
      const r = await fetch(`/api/horoscope?${params.toString()}`, { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as Data | { error?: string } | null;
      // Guard against error-shaped bodies (e.g. a 401 after the session expires)
      // so the grid never maps over a missing `entries`.
      if (!r.ok || !j || !Array.isArray((j as Data).entries)) {
        setData(null);
        if (d) { setDate(d); dateRef.current = d; }
        setLang(useLang); langRef.current = useLang;
        setMsg({ ok: false, text: (j as { error?: string })?.error ?? "लोड नहीं हो सका।" });
        return;
      }
      const dd = j as Data;
      setData(dd);
      setDate(dd.date); dateRef.current = dd.date;
      setLang(useLang); langRef.current = useLang;
    } catch {
      setData(null);
      setMsg({ ok: false, text: "लोड नहीं हो सका।" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(action: "regenerate" | "repush") {
    if (working) return;
    setWorking(action); setMsg(null);
    try {
      const r = await fetch("/api/horoscope", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, date }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setMsg({ ok: false, text: j.error ?? `विफल (${r.status})` });
      } else {
        setMsg({
          ok: true,
          text: action === "repush"
            ? (j.wpStatus === "pushed" ? "WordPress पर पुश हो गया।" : `पुश ${j.wpStatus}${j.error ? ": " + j.error : ""}`)
            : `राशिफल बन गया${j.wpStatus === "pushed" ? " और WordPress पर पुश हो गया।" : ` (WordPress: ${j.wpStatus})`}`,
        });
      }
      await load(date);
    } catch {
      setMsg({ ok: false, text: "नेटवर्क त्रुटि" });
    } finally {
      setWorking(null);
    }
  }

  const badge = WP_BADGE[data?.wpStatus ?? "none"];
  const isToday = data && date === data.today;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-2.5 mb-1">
        <Moon size={20} className="text-[var(--purple)]" />
        <h1 className="text-[20px] font-semibold text-[var(--text)]">राशिफल <span className="text-[var(--text-3)] font-normal">Horoscopes</span></h1>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-4">
        हर रात 12 बजे अगले दिन का राशिफल (हिंदी और अंग्रेज़ी, दोनों) अपने-आप बनता है और WordPress पर अलग-अलग प्रकाशित हो जाता है।
      </p>

      {/* Date + status bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center gap-1">
          <button onClick={() => load(shiftDate(date, -1))} disabled={!date || loading}
            className="px-2 py-1.5 rounded-lg border border-[var(--border)] text-[13px] hover:bg-[var(--surface-2)] disabled:opacity-50">←</button>
          <div className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[13px] font-medium min-w-[220px] text-center">
            {date ? fmtDate(date) : "…"}{isToday ? " · आज" : ""}
          </div>
          <button onClick={() => load(shiftDate(date, 1))} disabled={!date || loading}
            className="px-2 py-1.5 rounded-lg border border-[var(--border)] text-[13px] hover:bg-[var(--surface-2)] disabled:opacity-50">→</button>
          {!isToday && (
            <button onClick={() => load()} disabled={loading}
              className="ml-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[12px] hover:bg-[var(--surface-2)] disabled:opacity-50">आज</button>
          )}
        </div>
        <div className="flex items-center rounded-lg border border-[var(--border)] overflow-hidden text-[12px]">
          <button onClick={() => load(date, "hi")} disabled={loading}
            className={`px-2.5 py-1.5 ${lang === "hi" ? "text-white" : "hover:bg-[var(--surface-2)]"}`}
            style={lang === "hi" ? { background: "var(--purple)" } : undefined}>हिं</button>
          <button onClick={() => load(date, "en")} disabled={loading}
            className={`px-2.5 py-1.5 border-l border-[var(--border)] ${lang === "en" ? "text-white" : "hover:bg-[var(--surface-2)]"}`}
            style={lang === "en" ? { background: "var(--purple)" } : undefined}>EN</button>
        </div>
        <span className={`text-[12px] px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
        {data?.updatedAt && (
          <span className="text-[11px] text-[var(--text-3)]">
            अपडेट: {new Date(data.updatedAt).toLocaleString("hi-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}
          </span>
        )}

        {isAdmin && (
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => act("regenerate")} disabled={!!working || loading}
              className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: "var(--purple)" }}>
              {working === "regenerate" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {data && data.count > 0 ? "फिर से बनाएँ" : "अभी बनाएँ"}
            </button>
            {data && data.count === 12 && data.wpStatus !== "pushed" && (
              <button onClick={() => act("repush")} disabled={!!working || loading}
                className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                {working === "repush" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                WordPress पुश
              </button>
            )}
          </div>
        )}
      </div>

      {msg && <div className={`mb-4 text-[12px] ${msg.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{msg.text}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-10"><Loader2 size={16} className="animate-spin" /> लोड हो रहा है…</div>
      ) : !data || data.count === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-xl p-10 text-center">
          <Sparkles size={22} className="mx-auto text-[var(--text-3)] mb-2" />
          <div className="text-[14px] text-[var(--text-2)] font-medium">इस दिन का राशिफल अभी तैयार नहीं है</div>
          <div className="text-[12px] text-[var(--text-3)] mt-1">
            यह हर रात अपने-आप बनता है{isAdmin ? "। ऊपर “अभी बनाएँ” से मैन्युअली भी बना सकते हैं।" : "।"}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.entries.map((e) => (
            <div key={e.sign} className="bg-white border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="text-[15px] font-semibold text-[var(--text)]">{e.nameHi}</h3>
                <span className="text-[11px] text-[var(--text-3)]">{e.nameEn}</span>
                {e.mood && <span className="ml-auto text-[11px] text-[var(--purple)] bg-[color-mix(in_srgb,var(--purple)_8%,white)] rounded-full px-2 py-0.5">{e.mood}</span>}
              </div>
              <p className="text-[13px] text-[var(--text-2)] leading-relaxed mb-2">{e.forecast}</p>
              {e.zodiacContent && <p className="text-[12px] text-[var(--text-3)] leading-relaxed mb-2.5">{e.zodiacContent}</p>}
              <div className="flex flex-wrap gap-1.5">
                <Chip label="शुभ रंग" value={e.shubhRang} swatch={e.colorCode} />
                <Chip label="शुभ अंक" value={e.shubhAnk} />
                <Chip label="शुभ समय" value={e.shubhSamay} />
                {e.luckyLetters && <Chip label="शुभ अक्षर" value={e.luckyLetters} />}
              </div>
              {e.solution && (
                <div className="mt-2.5 text-[12px] text-[var(--text-2)]">
                  <span className="text-[var(--text-3)]">उपाय: </span>{e.solution}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-2 py-0.5">
      {swatch && <span className="w-2.5 h-2.5 rounded-full border border-[var(--border)] shrink-0" style={{ background: swatch }} />}
      <span className="text-[var(--text-3)]">{label}</span>
      <span className="font-medium text-[var(--text)]">{value}</span>
    </span>
  );
}
