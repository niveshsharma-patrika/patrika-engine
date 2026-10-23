"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, FileText, PenSquare } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Draft = { id: string; title: string; status: string; word_count: number | null; desk: string | null; updated_at: string };

const STATUS: Record<string, { en: string; hi: string; cls: string }> = {
  in_progress: { en: "Draft", hi: "ड्राफ़्ट", cls: "bg-[var(--surface-2)] text-[var(--text-2)]" },
  awaiting_review: { en: "In review", hi: "रिव्यू में", cls: "bg-[var(--amber-soft,#fef3c7)] text-[var(--amber,#b45309)]" },
  awaiting_approval: { en: "Awaiting approval", hi: "अनुमोदन बाकी", cls: "bg-[var(--amber-soft,#fef3c7)] text-[var(--amber,#b45309)]" },
  approved: { en: "Approved", hi: "स्वीकृत", cls: "bg-[var(--green-soft,#dcfce7)] text-[var(--green)]" },
  published: { en: "Published", hi: "प्रकाशित", cls: "bg-[var(--green-soft,#dcfce7)] text-[var(--green)]" },
  rejected: { en: "Rejected", hi: "अस्वीकृत", cls: "bg-[var(--red-soft)] text-[var(--red)]" },
};

export function PrintDrafts() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/drafts", { cache: "no-store" });
        const j = await r.json();
        if (r.ok) setDrafts(j.drafts ?? []);
      } catch {
        /* advisory */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[22px] font-medium">{hi ? "मेरे ड्राफ़्ट" : "My Drafts"}</h1>
        <Link href="/print/write" className="bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[13px] font-medium px-3.5 py-1.5 rounded flex items-center gap-1.5">
          <PenSquare size={13} /> {hi ? "नई स्टोरी" : "New story"}
        </Link>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">{hi ? "आपकी सेव की हुई स्टोरीज़।" : "Your saved stories."}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : drafts.length === 0 ? (
        <div className="text-[13px] text-[var(--text-3)] py-16 text-center border border-dashed border-[var(--border)] rounded-xl">
          {hi ? "अभी कोई ड्राफ़्ट नहीं — 'नई स्टोरी' से शुरू करें।" : "No drafts yet — start one with 'New story'."}
        </div>
      ) : (
        <ul className="bg-white border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
          {drafts.map((d) => {
            const st = STATUS[d.status] ?? { en: d.status, hi: d.status, cls: "bg-[var(--surface-2)] text-[var(--text-2)]" };
            return (
              <li key={d.id} className="px-4 py-3 flex items-center gap-3">
                <FileText size={15} className="text-[var(--text-3)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium text-[var(--text)] truncate">{d.title || (hi ? "(बिना शीर्षक)" : "(untitled)")}</div>
                  <div className="text-[11px] text-[var(--text-3)] mt-0.5">
                    {d.word_count ? `${d.word_count} ${hi ? "शब्द" : "words"} · ` : ""}{new Date(d.updated_at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{hi ? st.hi : st.en}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
