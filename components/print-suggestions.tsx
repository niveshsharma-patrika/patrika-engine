"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lightbulb, PenSquare, MapPin, AlertCircle } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { catLabel, writeHref } from "@/lib/print/ui";

type City = { key: string; name_en: string; name_hi: string; region: string };
type Idea = { headline: string; why: string; category: string; scope: "local" | "national" };

/** AI story ideas for today's edition — grounded in trending national stories
 *  + what the chosen city's local sources are carrying. */
export function PrintSuggestions() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const [cities, setCities] = useState<City[]>([]);
  const [city, setCity] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);
  const [ideasCity, setIdeasCity] = useState(""); // the city the shown ideas were made for

  useEffect(() => {
    fetch("/api/print/cities", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCities(Array.isArray(j) ? j : j.cities ?? []))
      .catch(() => { /* advisory */ });
  }, []);

  async function generate() {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ lang: hi ? "hi" : "en" });
      if (city) p.set("city", city);
      const r = await fetch(`/api/print/suggestions?${p}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      setIdeas(j.ideas ?? []);
      setIdeasCity(city);
      setRan(true);
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setLoading(false);
    }
  }

  const cityObj = cities.find((c) => c.key === ideasCity);
  const raj = cities.filter((c) => c.region === "rajasthan");
  const metro = cities.filter((c) => c.region !== "rajasthan");

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "आज के लिए सुझाव" : "Story ideas for today"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi ? "शहर चुनें — राष्ट्रीय ट्रेंड और उस शहर की लोकल ख़बरों से प्रिंट के लिए स्टोरी आइडिया बनते हैं। कोई आइडिया बना हुआ नहीं होता; सब आज की हेडलाइनों से निकलते हैं।" : "Pick a city — ideas come from national trends plus that city's local news. Nothing is invented; every idea traces back to today's headlines."}
      </p>

      <div className="bg-white border border-[var(--border)] rounded-xl p-4 mb-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-2)]">
          <MapPin size={13} />
          <select value={city} onChange={(e) => setCity(e.target.value)} className="border border-[var(--border)] rounded px-2 py-1.5 text-[13px] bg-white outline-none focus:border-[var(--red)] min-w-[200px]">
            <option value="">{hi ? "सभी शहर (राष्ट्रीय + लोकल)" : "All cities (national + local)"}</option>
            {raj.length > 0 && <optgroup label={hi ? "राजस्थान" : "Rajasthan"}>{raj.map((c) => <option key={c.key} value={c.key}>{hi ? c.name_hi : c.name_en}</option>)}</optgroup>}
            {metro.length > 0 && <optgroup label={hi ? "बड़े शहर" : "Metros"}>{metro.map((c) => <option key={c.key} value={c.key}>{hi ? c.name_hi : c.name_en}</option>)}</optgroup>}
          </select>
        </label>
        <button onClick={generate} disabled={loading}
          className="bg-[var(--red)] hover:bg-[var(--red-hover)] disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded flex items-center gap-1.5">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
          {loading ? (hi ? "सोच रहे हैं…" : "Thinking…") : ran ? (hi ? "फिर से बनाएँ" : "Regenerate") : (hi ? "आइडिया बनाएँ" : "Generate ideas")}
        </button>
        {loading && <span className="text-[11.5px] text-[var(--text-3)]">{hi ? "20–40 सेकंड लग सकते हैं।" : "Takes 20–40 seconds."}</span>}
      </div>

      {error && <div className="flex items-center gap-2 text-[13px] text-[var(--red)] mb-4"><AlertCircle size={15} /> {error}</div>}

      {ran && ideas.length === 0 && !loading && (
        <div className="text-[13px] text-[var(--text-3)] py-12 text-center border border-dashed border-[var(--border)] rounded-xl">{hi ? "कोई आइडिया नहीं मिला — बाद में फिर कोशिश करें।" : "No ideas came back — try again shortly."}</div>
      )}

      {ideas.length > 0 && (
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ideas.map((idea, i) => (
            <li key={i} className="bg-white border border-[var(--border)] rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={`px-2 py-0.5 rounded-full font-medium ${idea.scope === "local" ? "bg-[var(--red-soft)] text-[var(--red)]" : "bg-[var(--surface-2)] text-[var(--text-2)]"}`}>
                  {idea.scope === "local" ? (cityObj ? (hi ? cityObj.name_hi : cityObj.name_en) : (hi ? "लोकल" : "Local")) : (hi ? "राष्ट्रीय" : "National")}
                </span>
                {idea.category && <span className="text-[var(--text-3)]">{catLabel(idea.category, hi)}</span>}
              </div>
              <div className="text-[15px] font-medium leading-snug">{idea.headline}</div>
              <div className="text-[12.5px] text-[var(--text-2)] leading-relaxed flex-1">{idea.why}</div>
              <Link href={writeHref(idea.headline, idea.why, undefined, idea.scope === "local" ? ideasCity || undefined : undefined)}
                className="self-start inline-flex items-center gap-1 text-[12px] font-medium text-[var(--red)] border border-[var(--border)] hover:border-[var(--red)] rounded px-2.5 py-1">
                <PenSquare size={13} /> {hi ? "इस पर लिखें" : "Write this"}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
