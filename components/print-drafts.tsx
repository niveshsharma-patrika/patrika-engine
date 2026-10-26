"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, FileText, PenSquare, MapPin } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { statusCls, statusLabel, timeAgo } from "@/lib/print/ui";

type Draft = { id: string; title: string; status: string; word_count: number | null; city: string | null; desk: string | null; updated_at: string };

const FILTERS = ["", "in_progress", "awaiting_review", "approved", "rejected"] as const;

/** The writer's own print stories — reopen to keep editing, see desk status. */
export function PrintDrafts() {
  const { lang } = useLang();
  const hi = lang === "hi";
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/print/drafts?view=mine", { cache: "no-store" });
        const j = await r.json();
        if (r.ok) setDrafts(j.drafts ?? []);
      } catch {
        /* advisory */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const shown = filter ? drafts.filter((d) => d.status === filter) : drafts;
  const count = (s: string) => drafts.filter((d) => d.status === s).length;

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[22px] font-medium">{hi ? "मेरे ड्राफ़्ट" : "My Drafts"}</h1>
        <Link href="/print/write" className="bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[13px] font-medium px-3.5 py-1.5 rounded flex items-center gap-1.5">
          <PenSquare size={13} /> {hi ? "नई स्टोरी" : "New story"}
        </Link>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-4">{hi ? "आपकी स्टोरीज़ — खोलकर एडिट करें, डेस्क का जवाब देखें।" : "Your stories — open to keep editing, see what the desk said."}</p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button key={f || "all"} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-full text-[12px] border ${filter === f ? "bg-[var(--red)] text-white border-[var(--red)]" : "bg-white border-[var(--border)] text-[var(--text-2)] hover:border-[var(--red)]"}`}>
            {f ? statusLabel(f, hi) : (hi ? "सभी" : "All")} <span className="opacity-70">{f ? count(f) : drafts.length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
      ) : shown.length === 0 ? (
        <div className="text-[13px] text-[var(--text-3)] py-16 text-center border border-dashed border-[var(--border)] rounded-xl">
          {drafts.length === 0 ? (hi ? "अभी कोई ड्राफ़्ट नहीं — 'नई स्टोरी' से शुरू करें।" : "No drafts yet — start one with 'New story'.") : (hi ? "इस स्थिति में कोई स्टोरी नहीं।" : "Nothing in this status.")}
        </div>
      ) : (
        <ul className="bg-white border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
          {shown.map((d) => (
            <li key={d.id}>
              <Link href={`/print/write?draftId=${d.id}`} className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--surface-2)]">
                <FileText size={15} className="text-[var(--text-3)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium text-[var(--text)] truncate">{d.title || (hi ? "(बिना शीर्षक)" : "(untitled)")}</div>
                  <div className="text-[11px] text-[var(--text-3)] mt-0.5 flex items-center gap-2 flex-wrap">
                    {d.desk && <span className="inline-flex items-center gap-0.5"><MapPin size={10} /> {d.desk.replace(/^Local · /, "")}</span>}
                    {d.word_count ? <span>{d.word_count} {hi ? "शब्द" : "words"}</span> : null}
                    <span>{timeAgo(d.updated_at, hi)}</span>
                  </div>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusCls(d.status)}`}>{statusLabel(d.status, hi)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
