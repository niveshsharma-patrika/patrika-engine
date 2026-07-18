"use client";

import { useState } from "react";
import {
  ArrowLeft, Lightbulb, Loader2, PenSquare,
  ShieldAlert, Landmark, Building2, Wheat, Scale, HeartHandshake,
  HeartPulse, GraduationCap, Trophy, UtensilsCrossed, BookOpen,
  type LucideIcon,
} from "lucide-react";

import { MAGAZINES } from "@/lib/magazines";
import { useLang } from "@/lib/i18n/context";
import { Editor } from "@/app/page";

type Idea = { headline: string; subVertical: string; hook: string; benefit: string };

// Themed cover per magazine (gradient + icon) — a stand-in visual until real
// artwork is added.
const VISUALS: Record<string, { from: string; to: string; Icon: LucideIcon }> = {
  "crime-files":     { from: "#991b1b", to: "#450a0a", Icon: ShieldAlert },
  "politics-power":  { from: "#4338ca", to: "#1e1b4b", Icon: Landmark },
  "city-pulse":      { from: "#0d9488", to: "#134e4a", Icon: Building2 },
  "rural-panchayat": { from: "#16a34a", to: "#14532d", Icon: Wheat },
  "public-guide":    { from: "#2563eb", to: "#172554", Icon: Scale },
  "nari-shakti":     { from: "#db2777", to: "#500724", Icon: HeartHandshake },
  "health-plus":     { from: "#059669", to: "#064e3b", Icon: HeartPulse },
  "ai-education":    { from: "#7c3aed", to: "#2e1065", Icon: GraduationCap },
  "game-on":         { from: "#ea580c", to: "#7c2d12", Icon: Trophy },
  "food-culture":    { from: "#d97706", to: "#78350f", Icon: UtensilsCrossed },
};
const FALLBACK_VISUAL = { from: "#6b7280", to: "#374151", Icon: BookOpen };

export default function MagazinesPage() {
  const { lang } = useLang();
  const [selected, setSelected] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [ideasErr, setIdeasErr] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTitle, setComposerTitle] = useState("");

  const mag = MAGAZINES.find((m) => m.key === selected) ?? null;

  function open(key: string) {
    setSelected(key);
    setIdeas([]);
    setIdeasErr(null);
  }

  // Open the full article composer (the same one used from trending) seeded
  // with the chosen idea.
  function openComposer(seed: string) {
    setComposerTitle(seed.trim());
    setComposerOpen(true);
  }

  async function genIdeas() {
    if (!mag) return;
    setLoadingIdeas(true);
    setIdeasErr(null);
    try {
      const r = await fetch("/api/magazine/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ magazine: mag.key }),
      });
      const d = await r.json();
      if (!r.ok) setIdeasErr(d.error ?? "Failed");
      else setIdeas(Array.isArray(d.ideas) ? d.ideas : []);
    } catch {
      setIdeasErr("Network error");
    } finally {
      setLoadingIdeas(false);
    }
  }

  // ─── Magazine picker ───
  if (!mag) {
    return (
      <>
        <div className="pb-4 mb-6 border-b border-[var(--border)]">
          <h1 className="text-2xl font-medium">{lang === "hi" ? "पत्रिका+ विशेष कंटेंट" : "Patrika+ Special Content"}</h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1 max-w-2xl">
            {lang === "hi"
              ? "10 प्रीमियम कंटेंट पॉकेट्स — मैगज़ीन चुनें, टॉपिक-आइडिया जनरेट करें, फिर पूरा आर्टिकल लिखवाएं। प्रॉम्प्ट Writing Directives में एडिट करें।"
              : "10 premium content pockets — pick a magazine, generate topic ideas, then write a full article. Tune the prompts in Writing Directives."}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MAGAZINES.map((m) => {
            const v = VISUALS[m.key] ?? FALLBACK_VISUAL;
            return (
              <button
                key={m.key}
                onClick={() => open(m.key)}
                className="text-left bg-white border border-[var(--border)] rounded-lg overflow-hidden hover:border-[var(--red)] hover:shadow-sm transition-colors"
              >
                <div
                  className="h-24 flex items-center justify-center relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${v.from}, ${v.to})` }}
                >
                  <v.Icon size={34} strokeWidth={1.5} className="text-white/90" />
                  {/* AI-generated cover overlays the gradient; falls back to it if absent. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/magazines/${m.key}.jpg`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="p-4">
                  <div className="text-[15px] font-semibold text-[var(--text)]">{m.nameHi}</div>
                  <div className="text-[11px] text-[var(--text-3)] uppercase tracking-wide mb-1.5">{m.nameEn}</div>
                  <div className="text-[12.5px] text-[var(--text-2)] leading-snug">{m.tagline}</div>
                  <div className="text-[11px] text-[var(--text-3)] mt-2">{m.reader} · {m.age}</div>
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  // ─── Magazine workspace ───
  return (
    <>
      <button
        onClick={() => setSelected(null)}
        className="flex items-center gap-1.5 text-[13px] text-[var(--text-3)] hover:text-[var(--text)] mb-4"
      >
        <ArrowLeft size={14} /> {lang === "hi" ? "वापस" : "Back"}
      </button>

      <div className="pb-4 mb-5 border-b border-[var(--border)]">
        <h1 className="text-2xl font-medium">
          {mag.nameHi} <span className="text-[14px] text-[var(--text-3)] font-normal">· {mag.nameEn}</span>
        </h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1">{mag.tagline} · {mag.reader} ({mag.age})</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {mag.subVerticals.map((s, i) => (
            <span key={i} className="text-[10px] bg-[var(--surface-2)] text-[var(--text-2)] px-2 py-0.5 rounded-full">
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Ideas — generate, then pick one to open the full composer */}
      <section>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-[15px] font-semibold flex items-center gap-1.5">
              <Lightbulb size={16} className="text-[var(--amber)]" /> {lang === "hi" ? "आइडिया जनरेटर" : "Ideas generator"}
            </h2>
            <p className="text-[12px] text-[var(--text-3)] mt-0.5 max-w-xl">
              {lang === "hi"
                ? "आइडिया बनाएं, फिर किसी एक पर 'आर्टिकल बनाएँ' दबाकर पूरा कंपोज़र (सभी कंट्रोल्स के साथ) खोलें।"
                : "Generate ideas, then hit 'Generate article' on one to open the full composer — same as trending, with all the controls."}
            </p>
          </div>
          <button
            onClick={genIdeas}
            disabled={loadingIdeas}
            className="shrink-0 bg-[var(--text)] hover:bg-black text-white text-[13px] font-medium px-4 py-2 rounded disabled:opacity-50 flex items-center gap-1.5"
          >
            {loadingIdeas && <Loader2 size={13} className="animate-spin" />}
            {loadingIdeas
              ? lang === "hi" ? "बना रहे…" : "Generating…"
              : ideas.length
                ? lang === "hi" ? "और आइडिया" : "More ideas"
                : lang === "hi" ? "आइडिया बनाएं" : "Generate ideas"}
          </button>
        </div>

        {ideasErr && <div className="text-[12px] text-[var(--red)] mb-3">{ideasErr}</div>}

        {ideas.length === 0 && !loadingIdeas && (
          <div className="border border-dashed border-[var(--border)] rounded-lg p-12 text-center text-[13px] text-[var(--text-3)]">
            {lang === "hi"
              ? "इस मैगज़ीन के लिए 12–15 नए टॉपिक-आइडिया बनाएं, फिर किसी एक से आर्टिकल लिखें।"
              : "Generate 12–15 fresh topic ideas for this magazine, then write an article from one."}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {ideas.map((idea, i) => (
            <div key={i} className="flex flex-col bg-white border border-[var(--border)] rounded-lg p-4">
              <div className="text-[14px] font-medium text-[var(--text)] leading-snug">{idea.headline}</div>
              <div className="text-[11px] text-[var(--text-3)] mt-1">
                {idea.subVertical} · {idea.hook}
              </div>
              {idea.benefit && (
                <div className="text-[12px] text-[var(--text-2)] mt-2 leading-snug">{idea.benefit}</div>
              )}
              <button
                onClick={() => openComposer(idea.headline)}
                className="mt-3 self-start bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[12px] font-medium px-3 py-1.5 rounded flex items-center gap-1.5"
              >
                <PenSquare size={12} />
                {lang === "hi" ? "आर्टिकल बनाएँ" : "Generate article"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* The full composer — identical to the one opened from a trending story */}
      {composerOpen && (
        <Editor
          trend={null}
          title={composerTitle}
          setTitle={setComposerTitle}
          onClose={() => setComposerOpen(false)}
        />
      )}
    </>
  );
}
