"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Image as ImageIcon, Sparkles, Trash2, Loader2 } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type ListItem = {
  id: string;
  title: string;
  status: string;
  word_count: number;
  desk: string | null;
  updated_at: string;
  has_image: boolean;
};

type Detail = {
  id: string;
  title: string;
  body: string;
  status: string;
  word_count: number;
  desk: string | null;
  image_url: string | null;
  generation_metadata: Record<string, unknown> | null;
  updated_at: string;
};

const STATUS: Record<string, { en: string; hi: string }> = {
  in_progress: { en: "Draft", hi: "ड्राफ्ट" },
  awaiting_review: { en: "In review", hi: "समीक्षा में" },
  awaiting_approval: { en: "Awaiting approval", hi: "स्वीकृति प्रतीक्षित" },
  approved: { en: "Approved", hi: "स्वीकृत" },
  published: { en: "Published", hi: "प्रकाशित" },
  rejected: { en: "Rejected", hi: "अस्वीकृत" },
};

// meta key -> label, in display order.
const SETTINGS: Array<[string, string, string]> = [
  ["publication", "Publication", "प्रकाशन"],
  ["writer", "Writer", "लेखक"],
  ["tone", "Tone", "टोन"],
  ["voice", "Voice", "आवाज़"],
  ["readability", "Readability", "पठनीयता"],
  ["urgency", "Urgency", "तात्कालिकता"],
  ["audienceFit", "Audience", "पाठक"],
  ["trendingScore", "Trending", "ट्रेंडिंग"],
  ["headlineType", "Headline type", "हेडलाइन प्रकार"],
  ["leadStyle", "Lead style", "लीड शैली"],
  ["wordCount", "Word count", "शब्द लक्ष्य"],
];

function fmt(ms: string): string {
  try {
    return new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function GeneratedPage() {
  const { lang } = useLang();
  const [drafts, setDrafts] = useState<ListItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function loadList() {
    setState("loading");
    try {
      const d = await fetch("/api/drafts", { cache: "no-store" }).then((r) => r.json());
      setDrafts(Array.isArray(d.drafts) ? d.drafts : []);
      setState("ready");
    } catch {
      setState("error");
    }
  }
  useEffect(() => {
    loadList();
  }, []);

  async function open(id: string) {
    setSelectedId(id);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const d = await fetch(`/api/drafts/${id}`, { cache: "no-store" }).then((r) => r.json());
      setDetail(d.draft ?? null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(lang === "hi" ? "यह लेख हटाएँ?" : "Delete this article?")) return;
    await fetch(`/api/drafts/${id}`, { method: "DELETE" });
    setSelectedId(null);
    setDetail(null);
    loadList();
  }

  // ─── Detail view ───
  if (selectedId) {
    const meta = (detail?.generation_metadata ?? {}) as Record<string, unknown>;
    const widgetHtml = typeof meta.widgetHtml === "string" ? meta.widgetHtml : "";
    const angle = meta.angle as { title?: string } | null | undefined;
    return (
      <>
        <button
          onClick={() => {
            setSelectedId(null);
            setDetail(null);
          }}
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-3)] hover:text-[var(--text)] mb-4"
        >
          <ArrowLeft size={14} /> {lang === "hi" ? "मेरे लेख" : "My articles"}
        </button>

        {loadingDetail && <div className="text-sm text-[var(--text-3)]">{lang === "hi" ? "लोड हो रहा है…" : "Loading…"}</div>}

        {detail && (
          <div className="max-w-3xl">
            <div className="flex items-start justify-between gap-4 pb-4 mb-5 border-b border-[var(--border)]">
              <div>
                <h1 className="text-2xl font-medium leading-snug">{detail.title}</h1>
                <p className="text-[12px] text-[var(--text-3)] mt-1">
                  {STATUS[detail.status]?.[lang] ?? detail.status} · {detail.word_count} {lang === "hi" ? "शब्द" : "words"} · {fmt(detail.updated_at)}
                </p>
              </div>
              <button
                onClick={() => remove(detail.id)}
                className="shrink-0 flex items-center gap-1.5 text-[12px] text-[var(--red)] hover:underline"
              >
                <Trash2 size={13} /> {lang === "hi" ? "हटाएँ" : "Delete"}
              </button>
            </div>

            {/* Settings used */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mb-5 text-[13px] bg-white border border-[var(--border)] rounded-lg p-4">
              {SETTINGS.map(([key, en, hi]) =>
                meta[key] != null && meta[key] !== "" ? (
                  <div key={key} className="flex justify-between gap-2">
                    <span className="text-[var(--text-3)]">{lang === "hi" ? hi : en}</span>
                    <span className="font-medium text-right">{String(meta[key])}</span>
                  </div>
                ) : null
              )}
              {angle?.title && (
                <div className="col-span-2 sm:col-span-3 flex justify-between gap-2 pt-1 border-t border-[var(--border)]">
                  <span className="text-[var(--text-3)]">{lang === "hi" ? "एंगल" : "Angle"}</span>
                  <span className="font-medium text-right">{angle.title}</span>
                </div>
              )}
            </div>

            {/* Image */}
            {detail.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={detail.image_url} alt="" className="w-full rounded-xl border border-[var(--border)] mb-5" />
            )}

            {/* Body */}
            <div className="bg-white border border-[var(--border)] rounded-xl p-6 whitespace-pre-wrap text-[15px] leading-[1.7] mb-5">
              {detail.body || <span className="text-[var(--text-3)]">{lang === "hi" ? "कोई सामग्री नहीं।" : "No body saved."}</span>}
            </div>

            {/* Widget */}
            {widgetHtml && (
              <div className="mb-6">
                <h4 className="text-[14px] font-semibold flex items-center gap-1.5 mb-2">
                  <Sparkles size={15} className="text-[var(--purple)]" /> {lang === "hi" ? "इंटरैक्टिव विजेट" : "Interactive widget"}
                </h4>
                <iframe
                  title="widget"
                  srcDoc={widgetHtml}
                  sandbox="allow-scripts"
                  className="w-full rounded-xl border border-[var(--border)] bg-white"
                  style={{ height: 520 }}
                />
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  // ─── List view ───
  return (
    <>
      <div className="pb-4 mb-6 border-b border-[var(--border)]">
        <h1 className="text-2xl font-medium">{lang === "hi" ? "मेरे लेख" : "My Articles"}</h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1 max-w-2xl">
          {lang === "hi"
            ? "आपके द्वारा बनाए और सेव किए गए लेख — सेटिंग्स, इमेज और विजेट के साथ। केवल आपको दिखते हैं।"
            : "Articles you've generated and saved — with their settings, image and widget. Visible only to you."}
        </p>
      </div>

      {state === "loading" && <div className="text-sm text-[var(--text-3)]">{lang === "hi" ? "लोड हो रहा है…" : "Loading…"}</div>}
      {state === "error" && <div className="text-sm text-[var(--red)]">{lang === "hi" ? "लोड नहीं हो सका।" : "Could not load."}</div>}
      {state === "ready" && drafts.length === 0 && (
        <div className="border border-dashed border-[var(--border)] rounded-lg p-12 text-center text-[14px] text-[var(--text-2)]">
          {lang === "hi"
            ? "अभी कोई लेख नहीं — किसी स्टोरी पर लिखें और 'ड्राफ्ट सेव करें' दबाएँ।"
            : "No articles yet — write on a story and hit 'Save as draft'."}
        </div>
      )}

      <div className="space-y-2 max-w-3xl">
        {drafts.map((d) => (
          <button
            key={d.id}
            onClick={() => open(d.id)}
            className="w-full text-left flex items-center gap-3 bg-white border border-[var(--border)] rounded-lg px-4 py-3 hover:border-[var(--red)] hover:shadow-sm transition-colors"
          >
            <FileText size={16} className="text-[var(--text-3)] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-[var(--text)] truncate">{d.title}</div>
              <div className="text-[11px] text-[var(--text-3)] mt-0.5">
                {STATUS[d.status]?.[lang] ?? d.status} · {d.word_count} {lang === "hi" ? "शब्द" : "words"} · {fmt(d.updated_at)}
              </div>
            </div>
            {d.has_image && <ImageIcon size={14} className="text-[var(--text-3)] shrink-0" />}
          </button>
        ))}
      </div>
    </>
  );
}
