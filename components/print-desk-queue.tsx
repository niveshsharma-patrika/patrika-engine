"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Check, Undo2, RotateCcw, Download, UserCheck, UserMinus, X, MapPin, AlertCircle } from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { downloadStoryTxt, statusCls, statusLabel, timeAgo } from "@/lib/print/ui";

type Row = { id: string; title: string; status: string; word_count: number | null; city: string | null; desk: string | null; assigned_to: string | null; author_name: string | null; updated_at: string };
type Full = Row & { body: string; generation_metadata: Record<string, unknown> | null; author_id: string };

const FILTERS = ["awaiting_review", "approved", "rejected", ""] as const;

/** The desk queue (editors/admins): stories submitted by print writers —
 *  read, approve, send back, assign to yourself, export. */
export function PrintDeskQueue({ me }: { me: string }) {
  const { lang } = useLang();
  const hi = lang === "hi";
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("awaiting_review");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Full | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/print/drafts?view=desk", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      setRows(j.drafts ?? []);
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setLoading(false);
    }
  }, [hi]);

  useEffect(() => { load(); }, [load]);

  async function openRow(id: string) {
    openRef.current = id;
    setOpening(id); setError(null);
    try {
      const r = await fetch(`/api/print/drafts/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (openRef.current !== id) return; // a later click superseded this one
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      setOpen(j.draft);
    } catch {
      if (openRef.current === id) setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      if (openRef.current === id) setOpening(null);
    }
  }

  async function act(patch: { status?: string; assigned_to?: string | null }) {
    if (!open || acting) return;
    setActing(true); setError(null);
    try {
      const r = await fetch(`/api/print/drafts/${open.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      setOpen({ ...open, ...(patch.status ? { status: patch.status } : {}), ...("assigned_to" in patch ? { assigned_to: patch.assigned_to ?? null } : {}) });
      await load();
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setActing(false);
    }
  }

  const shown = filter ? rows.filter((d) => d.status === filter) : rows;
  const count = (s: string) => rows.filter((d) => d.status === s).length;
  const deck = typeof open?.generation_metadata?.deck === "string" ? (open.generation_metadata.deck as string) : "";
  const btn = "inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded border disabled:opacity-50";

  return (
    <div className="p-6">
      <h1 className="text-[22px] font-medium mb-1">{hi ? "डेस्क" : "Desk"}</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-4">{hi ? "लेखकों द्वारा भेजी गई प्रिंट स्टोरीज़ — पढ़ें, स्वीकृत करें या वापस भेजें।" : "Print stories submitted by writers — read, approve or send back."}</p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button key={f || "all"} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-full text-[12px] border ${filter === f ? "bg-[var(--red)] text-white border-[var(--red)]" : "bg-white border-[var(--border)] text-[var(--text-2)] hover:border-[var(--red)]"}`}>
            {f ? statusLabel(f, hi) : (hi ? "सभी" : "All")} <span className="opacity-70">{f ? count(f) : rows.length}</span>
          </button>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 text-[13px] text-[var(--red)] mb-3"><AlertCircle size={15} /> {error}</div>}

      <div className={`grid gap-4 ${open ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" : "grid-cols-1"}`}>
        <div>
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}</div>
          ) : shown.length === 0 ? (
            <div className="text-[13px] text-[var(--text-3)] py-16 text-center border border-dashed border-[var(--border)] rounded-xl">{hi ? "इस स्थिति में कुछ नहीं।" : "Nothing in this status."}</div>
          ) : (
            <ul className="bg-white border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
              {shown.map((d) => (
                <li key={d.id}>
                  <button onClick={() => openRow(d.id)} className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--surface-2)] ${open?.id === d.id ? "bg-[var(--red-soft)]" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium truncate">{d.title || (hi ? "(बिना शीर्षक)" : "(untitled)")}</div>
                      <div className="text-[11px] text-[var(--text-3)] mt-0.5 flex items-center gap-2 flex-wrap">
                        {d.author_name && <span>{d.author_name}</span>}
                        {d.desk && <span className="inline-flex items-center gap-0.5"><MapPin size={10} /> {d.desk.replace(/^Local · /, "")}</span>}
                        {d.word_count ? <span>{d.word_count} {hi ? "शब्द" : "words"}</span> : null}
                        <span>{timeAgo(d.updated_at, hi)}</span>
                        {d.assigned_to === me && <span className="text-[var(--red)]">{hi ? "मुझे असाइन" : "Assigned to me"}</span>}
                      </div>
                    </div>
                    {opening === d.id ? <Loader2 size={13} className="animate-spin text-[var(--text-3)]" /> : <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusCls(d.status)}`}>{statusLabel(d.status, hi)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {open && (
          <div className="bg-white border border-[var(--border)] rounded-xl p-5 self-start sticky top-[76px]">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-[11px] text-[var(--text-3)] flex items-center gap-2 mb-1">
                  <span className={`font-medium px-2 py-0.5 rounded-full ${statusCls(open.status)}`}>{statusLabel(open.status, hi)}</span>
                  {open.author_name && <span>{open.author_name}</span>}
                  {open.desk && <span>{open.desk.replace(/^Local · /, "")}</span>}
                  <span>{open.word_count ?? 0} {hi ? "शब्द" : "words"}</span>
                </div>
                <h2 className="text-[18px] font-semibold leading-snug">{open.title}</h2>
                {deck && <p className="text-[13.5px] text-[var(--text-2)] mt-1">{deck}</p>}
              </div>
              <button onClick={() => setOpen(null)} className="text-[var(--text-3)] hover:text-[var(--text)] p-1 shrink-0"><X size={16} /></button>
            </div>
            <div className="text-[14px] leading-relaxed whitespace-pre-wrap max-h-[55vh] overflow-y-auto border-t border-[var(--border)] pt-3">{open.body}</div>
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-[var(--border)]">
              {open.status !== "approved" && (
                <button onClick={() => act({ status: "approved" })} disabled={acting} className={`${btn} bg-[var(--green)] text-white border-[var(--green)]`}><Check size={13} /> {hi ? "स्वीकृत करें" : "Approve"}</button>
              )}
              {open.status !== "rejected" && (
                <button onClick={() => act({ status: "rejected" })} disabled={acting} className={`${btn} bg-white border-[var(--border)] hover:border-[var(--red)] text-[var(--red)]`}><Undo2 size={13} /> {hi ? "वापस भेजें" : "Send back"}</button>
              )}
              {open.status !== "awaiting_review" && (
                <button onClick={() => act({ status: "awaiting_review" })} disabled={acting} className={`${btn} bg-white border-[var(--border)] hover:border-[var(--red)]`}><RotateCcw size={13} /> {hi ? "फिर कतार में" : "Re-queue"}</button>
              )}
              {open.assigned_to === me ? (
                <button onClick={() => act({ assigned_to: null })} disabled={acting} className={`${btn} bg-white border-[var(--border)] hover:border-[var(--red)]`}><UserMinus size={13} /> {hi ? "असाइन हटाएँ" : "Unassign"}</button>
              ) : (
                <button onClick={() => act({ assigned_to: me })} disabled={acting} className={`${btn} bg-white border-[var(--border)] hover:border-[var(--red)]`}><UserCheck size={13} /> {hi ? "मुझे असाइन करें" : "Assign to me"}</button>
              )}
              <button onClick={() => downloadStoryTxt(open.title, deck, open.body)} className={`${btn} bg-white border-[var(--border)] hover:border-[var(--red)] ml-auto`}><Download size={13} /> .txt</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
