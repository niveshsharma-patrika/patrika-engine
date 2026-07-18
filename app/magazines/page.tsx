"use client";

import { useState } from "react";
import {
  ArrowLeft, Lightbulb, Loader2, FileText, PenSquare,
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
  const [topic, setTopic] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTitle, setComposerTitle] = useState("");

  const mag = MAGAZINES.find((m) => m.key === selected) ?? null;

  function open(key: string) {
    setSelected(key);
    setIdeas([]);
    setIdeasErr(null);
    setTopic("");
  }

  // Open the full article composer (the same one used from trending) seeded
  // with a topic or a generated idea.
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

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Ideas generator (Layer 1) */}
        <section className="bg-white border border-[var(--border)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-semibold flex items-center gap-1.5">
              <Lightbulb size={15} className="text-[var(--amber)]" /> {lang === "hi" ? "आइडिया जनरेटर" : "Ideas generator"}
            </h2>
            <button
              onClick={genIdeas}
              disabled={loadingIdeas}
              className="bg-[var(--text)] hover:bg-black text-white text-[12px] font-medium px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5"
            >
              {loadingIdeas && <Loader2 size={12} className="animate-spin" />}
              {loadingIdeas
                ? lang === "hi" ? "बना रहे…" : "Generating…"
                : ideas.length
                  ? lang === "hi" ? "और आइडिया" : "More ideas"
                  : lang === "hi" ? "आइडिया बनाएं" : "Generate ideas"}
            </button>
          </div>
          {ideasErr && <div className="text-[12px] text-[var(--red)] mb-2">{ideasErr}</div>}
          {ideas.length === 0 && !loadingIdeas && (
            <p className="text-[12.5px] text-[var(--text-3)]">
              {lang === "hi" ? "इस मैगज़ीन के लिए 12–15 नए टॉपिक-आइडिया बनाएं।" : "Generate 12–15 fresh topic ideas for this magazine."}
            </p>
          )}
          <div className="space-y-2">
            {ideas.map((idea, i) => (
              <div key={i} className="border border-[var(--border)] rounded-md p-2.5">
                <div className="text-[13px] font-medium text-[var(--text)]">{idea.headline}</div>
                <div className="text-[11px] text-[var(--text-3)] mt-0.5">
                  {idea.subVertical} · {idea.hook}
                </div>
                <button
                  onClick={() => openComposer(idea.headline)}
                  className="text-[11px] text-[var(--red)] mt-1.5 hover:underline font-medium"
                >
                  {lang === "hi" ? "आर्टिकल बनाएँ →" : "Generate article →"}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Article generator — opens the full composer (same as trending) */}
        <section className="bg-white border border-[var(--border)] rounded-lg p-4">
          <h2 className="text-[14px] font-semibold flex items-center gap-1.5 mb-1">
            <FileText size={15} className="text-[var(--blue)]" /> {lang === "hi" ? "आर्टिकल जनरेटर" : "Article generator"}
          </h2>
          <p className="text-[12px] text-[var(--text-3)] mb-3">
            {lang === "hi"
              ? "पूरा कंपोज़र खुलेगा — ट्रेंडिंग जैसा, सभी कंट्रोल्स (टोन, वॉइस, प्रकाशन, शब्द-सीमा…) के साथ।"
              : "Opens the full composer — same as trending, with every control (tone, voice, publication, word count…)."}
          </p>
          <label className="block text-[11px] font-medium text-[var(--text-2)] mb-1">{lang === "hi" ? "टॉपिक" : "Topic"}</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder={lang === "hi" ? "टॉपिक लिखें या बाईं ओर किसी आइडिया से चुनें…" : "Type a topic, or pick an idea on the left…"}
            className="w-full text-[13px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 outline-none focus:border-[var(--blue)] focus:bg-white resize-y mb-2"
          />
          <button
            onClick={() => openComposer(topic)}
            disabled={!topic.trim()}
            className="bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[12px] font-medium px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5"
          >
            <PenSquare size={12} />
            {lang === "hi" ? "आर्टिकल बनाएँ" : "Generate article"}
          </button>
        </section>
      </div>

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
