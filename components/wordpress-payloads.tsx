"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText, Loader2, AlertCircle, ChevronRight, Copy, Check, ExternalLink, CircleCheck, CircleX } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Row = {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  magazine: string;
  title: string;
  categories: string[];
  payload: unknown;
  ok: boolean;
  status: number | null;
  wp_post_id: number | null;
  wp_link: string | null;
  error: string | null;
};

const PAGE = 50;

function when(ts: string): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return ts;
  return new Date(t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function WordPressPayloads() {
  const { lang } = useLang();
  const hi = lang === "hi";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    if (before) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/wordpress-payloads?limit=${PAGE}${before ? `&before=${before}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed to load"); return; }
      setRows((prev) => (before ? [...prev, ...j.rows] : j.rows));
      setHasMore(Boolean(j.hasMore));
    } catch {
      setError(hi ? "नेटवर्क त्रुटि" : "Network error");
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [hi]);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function copyPayload(id: string, payload: unknown) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch { /* clipboard blocked */ }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2.5 mb-1">
        <ScrollText size={20} className="text-[var(--purple)]" />
        <h1 className="text-[20px] font-semibold text-[var(--text)]">{hi ? "वर्डप्रेस पेलोड" : "WordPress Payloads"}</h1>
      </div>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        {hi
          ? "हर Patrika+ लेख जो WordPress को भेजा गया — उसका सटीक पेलोड, कैटेगरी और CMS का जवाब। किसी पंक्ति पर क्लिक कर पूरा पेलोड देखें।"
          : "Every Patrika+ article sent to WordPress — its exact payload, categories, and the CMS response. Click a row to see the full payload."}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--red)] py-16 justify-center">
          <AlertCircle size={16} /> {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-[13px] text-[var(--text-3)] py-16 text-center">
          {hi ? "अभी तक कोई पेलोड नहीं भेजा गया।" : "No payloads sent yet."}
        </div>
      ) : (
        <>
          <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden divide-y divide-[var(--border)]">
            {rows.map((row) => {
              const isOpen = open.has(row.id);
              return (
                <div key={row.id}>
                  <button onClick={() => toggle(row.id)} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[var(--surface-2)] transition-colors">
                    <ChevronRight size={15} className={`mt-0.5 shrink-0 text-[var(--text-3)] transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    {row.ok
                      ? <CircleCheck size={15} className="mt-0.5 shrink-0 text-[var(--green)]" />
                      : <CircleX size={15} className="mt-0.5 shrink-0 text-[var(--red)]" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium text-[var(--text)] truncate">{row.title || (hi ? "(शीर्षक नहीं)" : "(untitled)")}</div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px] text-[var(--text-3)]">
                        {row.categories.map((c, i) => (
                          <span key={i} className="bg-[var(--surface-2)] px-1.5 py-0.5 rounded font-mono text-[var(--text-2)]">{c}</span>
                        ))}
                        {row.magazine && <span>· {row.magazine}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0 text-[11px] text-[var(--text-3)]">
                      <div>{when(row.created_at)}</div>
                      <div className="truncate max-w-[160px]">{row.user_name || row.user_email || "—"}</div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 bg-[var(--surface-2)]">
                      <div className="flex items-center gap-3 flex-wrap text-[12px] mb-2">
                        <span className={row.ok ? "text-[var(--green)]" : "text-[var(--red)]"}>
                          {row.ok ? (hi ? "भेजा गया" : "Sent") : (hi ? "विफल" : "Failed")}{row.status != null && ` · ${row.status}`}
                        </span>
                        {row.wp_link && (
                          <a href={row.wp_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--purple)] hover:underline">
                            <ExternalLink size={12} /> {hi ? "पोस्ट देखें" : "View post"}{row.wp_post_id != null && ` #${row.wp_post_id}`}
                          </a>
                        )}
                        {row.user_email && <span className="text-[var(--text-3)]">{row.user_email}</span>}
                      </div>
                      {row.error && (
                        <div className="text-[12px] text-[var(--red)] bg-[var(--red-soft,#fee2e2)] px-2.5 py-1.5 rounded mb-2 break-words">{row.error}</div>
                      )}
                      <div className="relative">
                        <button onClick={() => copyPayload(row.id, row.payload)}
                          className="absolute right-2 top-2 text-[11px] bg-white border border-[var(--border)] hover:border-[var(--purple)] px-2 py-0.5 rounded flex items-center gap-1">
                          {copied === row.id ? <Check size={11} className="text-[var(--green)]" /> : <Copy size={11} />}
                          {copied === row.id ? (hi ? "कॉपी" : "Copied") : (hi ? "कॉपी" : "Copy")}
                        </button>
                        <pre className="text-[11.5px] font-mono text-[var(--text-1)] bg-white border border-[var(--border)] rounded p-3 overflow-x-auto max-h-[420px] whitespace-pre-wrap break-words">
{JSON.stringify(row.payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-4">
              <button onClick={() => load(rows[rows.length - 1]?.id)} disabled={loadingMore}
                className="bg-white border border-[var(--border)] hover:border-[var(--purple)] text-[13px] font-medium px-5 py-2 rounded flex items-center gap-1.5 disabled:opacity-50">
                {loadingMore && <Loader2 size={13} className="animate-spin" />} {hi ? "और दिखाएँ" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
