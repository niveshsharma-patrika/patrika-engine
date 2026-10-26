"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, KeyRound, Copy, Check, RefreshCw, Send, X, AlertTriangle, CheckCircle2 } from "lucide-react";

type Flag = { type: string; unit?: string; detail: string };
type Row = {
  id: string; external_id: string; title: string; title_en: string | null; status: string; review: string | null;
  flags: Flag[]; model: string | null; error: string | null; callback_status: number | null; callback_attempts: number;
  callback_error: string | null; delivered_at: string | null; created_at: string; completed_at: string | null;
};
type Full = Row & { source: { title: string; excerpt: string; content: string }; result: { title: string; excerpt: string; content: string; slug: string } | null; callback_url: string };
type Settings = { apiKeySet: boolean; apiKeyUpdatedAt: string | null; callbackUrl: string | null };

const fmt = (ts: string | null) => (ts ? new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function StatusBadge({ r }: { r: Row }) {
  const [label, cls] =
    r.status === "done" && r.review === "ok" ? ["Translated", "bg-[#dcfce7] text-[#166534]"]
    : r.status === "done" ? [`Needs review · ${r.flags.length}`, "bg-[#fef3c7] text-[#92400e]"]
    : r.status === "failed" ? ["Failed", "bg-[var(--red-soft)] text-[var(--red)]"]
    : r.status === "processing" ? ["Translating…", "bg-[var(--surface-2)] text-[var(--text-2)]"]
    : ["Queued", "bg-[var(--surface-2)] text-[var(--text-2)]"];
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
}

function Delivery({ r }: { r: Row }) {
  if (r.status !== "done" && r.status !== "failed") return <span className="text-[11px] text-[var(--text-3)]">—</span>;
  if (r.delivered_at) return <span className="text-[11px] text-[#166534]">Sent {fmt(r.delivered_at)}</span>;
  return <span className="text-[11px] text-[var(--red)]" title={r.callback_error ?? ""}>Not delivered ({r.callback_attempts} tries)</span>;
}

/** Admin → Translations: settings for the WordPress translation API + every job. */
export function TranslationLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Full | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cbUrl, setCbUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/translations", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      setRows(j.jobs); setHasMore(j.hasMore); setSettings(j.settings);
      setCbUrl((prev) => prev || j.settings?.callbackUrl || "");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function more() {
    const last = rows[rows.length - 1];
    if (!last) return;
    const r = await fetch(`/api/admin/translations?before=${encodeURIComponent(last.created_at)}`, { cache: "no-store" });
    const j = await r.json();
    if (r.ok) { setRows((p) => [...p, ...j.jobs]); setHasMore(j.hasMore); }
  }

  async function action(payload: Record<string, unknown>, tag: string) {
    setBusy(tag); setError(null);
    try {
      const r = await fetch("/api/admin/translations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return null; }
      return j;
    } catch {
      setError("Network error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function openRow(id: string) {
    setBusy(`open:${id}`);
    try {
      const r = await fetch(`/api/admin/translations?id=${id}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) setOpen(j.job); else setError(j.error ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  const btn = "inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded border border-[var(--border)] bg-white hover:border-[var(--text-3)] disabled:opacity-50";

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-medium mb-1">Translations</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        Hindi → English translation API for WordPress. Editorial articles come in, are translated under the accuracy rules (nothing added, nothing dropped, figures and names exact), checked, and sent back. Anything a check flags is returned as <b>Needs review</b> with the exact problem.
      </p>

      {/* Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-[var(--border)] rounded-md p-4">
          <h3 className="text-[13px] font-semibold mb-1 flex items-center gap-1.5"><KeyRound size={14} /> API key for WordPress</h3>
          <p className="text-[11.5px] text-[var(--text-3)] mb-3">WordPress sends it as the <code className="font-mono">X-API-Key</code> header; callbacks are signed with it. Generating a new key stops the old one immediately.</p>
          <div className="text-[12px] text-[var(--text-2)] mb-3">{settings?.apiKeySet ? `Set · last changed ${fmt(settings.apiKeyUpdatedAt)}` : "Not set yet"}</div>
          {newKey ? (
            <div className="bg-[#fef3c7] border border-[#fcd34d] rounded p-2.5">
              <div className="text-[11.5px] text-[#92400e] mb-1.5 font-medium">Copy this now — it won&rsquo;t be shown again.</div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-[11.5px] break-all flex-1">{newKey}</code>
                <button className={btn} onClick={() => { navigator.clipboard.writeText(newKey); setCopied(true); }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
              </div>
            </div>
          ) : (
            <button className={btn} disabled={busy === "key"}
              onClick={async () => {
                if (settings?.apiKeySet && !confirm("Generate a new key? The current key stops working immediately.")) return;
                const j = await action({ action: "rotate_key" }, "key");
                if (j) { setNewKey(j.apiKey); setCopied(false); load(); }
              }}>
              {busy === "key" ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} {settings?.apiKeySet ? "Generate new key" : "Generate key"}
            </button>
          )}
        </div>
        <div className="bg-white border border-[var(--border)] rounded-md p-4">
          <h3 className="text-[13px] font-semibold mb-1 flex items-center gap-1.5"><Send size={14} /> Callback URL</h3>
          <p className="text-[11.5px] text-[var(--text-3)] mb-3">Where finished translations are POSTed (from the WordPress developer). A request may send its own <code className="font-mono">callback_url</code>, but only on this same site.</p>
          <div className="flex gap-2">
            <input value={cbUrl} onChange={(e) => setCbUrl(e.target.value)} placeholder="https://…/wp-json/…/translation-callback"
              className="flex-1 border border-[var(--border)] rounded px-2.5 py-1.5 text-[12.5px] font-mono outline-none focus:border-[var(--blue)]" />
            <button className={btn} disabled={busy === "cb" || !cbUrl.trim() || cbUrl.trim() === settings?.callbackUrl}
              onClick={async () => { if (await action({ action: "set_callback", url: cbUrl.trim() }, "cb")) load(); }}>
              {busy === "cb" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
            </button>
          </div>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 text-[13px] text-[var(--red)] mb-3"><AlertTriangle size={14} /> {error}</div>}

      <div className={`grid gap-4 ${open ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" : "grid-cols-1"}`}>
        <div>
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-[13px] text-[var(--text-3)] py-16 text-center border border-dashed border-[var(--border)] rounded-md">No articles received yet.</div>
          ) : (
            <>
              <ul className="bg-white border border-[var(--border)] rounded-md divide-y divide-[var(--border)]">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => openRow(r.id)} className={`w-full text-left px-4 py-3 hover:bg-[var(--surface-2)] ${open?.id === r.id ? "bg-[var(--surface-2)]" : ""}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-medium truncate">{r.title}</div>
                          {r.title_en && <div className="text-[12.5px] text-[var(--text-2)] truncate">{r.title_en}</div>}
                          <div className="text-[11px] text-[var(--text-3)] mt-0.5 flex gap-2 flex-wrap">
                            <span>WP #{r.external_id}</span><span>{fmt(r.created_at)}</span><Delivery r={r} />
                          </div>
                        </div>
                        {busy === `open:${r.id}` ? <Loader2 size={13} className="animate-spin text-[var(--text-3)]" /> : <StatusBadge r={r} />}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {hasMore && <button onClick={more} className={`${btn} mt-3`}>Load more</button>}
            </>
          )}
        </div>

        {open && (
          <div className="bg-white border border-[var(--border)] rounded-md p-4 self-start sticky top-[76px] max-h-[calc(100vh-100px)] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="text-[11.5px] text-[var(--text-3)] flex flex-wrap gap-x-3 gap-y-1">
                <StatusBadge r={open} /><span>WP #{open.external_id}</span><span>{open.model ?? ""}</span><Delivery r={open} />
              </div>
              <button onClick={() => setOpen(null)} className="text-[var(--text-3)] hover:text-[var(--text)] p-1"><X size={16} /></button>
            </div>

            {open.flags.length > 0 ? (
              <div className="bg-[#fffbeb] border border-[#fde68a] rounded p-3 mb-3">
                <div className="text-[12px] font-semibold text-[#92400e] mb-1.5 flex items-center gap-1.5"><AlertTriangle size={13} /> Flagged for review</div>
                <ul className="space-y-1 list-disc pl-4">{open.flags.map((f, i) => <li key={i} className="text-[12px] text-[#78350f]">{f.detail}</li>)}</ul>
              </div>
            ) : open.status === "done" ? (
              <div className="text-[12px] text-[#166534] mb-3 flex items-center gap-1.5"><CheckCircle2 size={13} /> All checks passed.</div>
            ) : null}
            {open.error && <div className="text-[12px] text-[var(--red)] mb-3">Error: {open.error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[var(--text-3)] mb-1">Hindi (received)</div>
                <h3 className="text-[15px] font-semibold leading-snug mb-1">{open.source.title}</h3>
                {open.source.excerpt && <p className="text-[12.5px] text-[var(--text-2)] mb-2">{open.source.excerpt}</p>}
                <pre className="text-[12px] whitespace-pre-wrap font-sans leading-relaxed bg-[var(--surface-2)] rounded p-2">{open.source.content}</pre>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[var(--text-3)] mb-1">English (sent back)</div>
                {open.result ? (
                  <>
                    <h3 className="text-[15px] font-semibold leading-snug mb-1">{open.result.title}</h3>
                    {open.result.excerpt && <p className="text-[12.5px] text-[var(--text-2)] mb-2">{open.result.excerpt}</p>}
                    <div className="text-[11px] text-[var(--text-3)] mb-1 font-mono">slug: {open.result.slug}</div>
                    <pre className="text-[12px] whitespace-pre-wrap font-sans leading-relaxed bg-[var(--surface-2)] rounded p-2">{open.result.content}</pre>
                  </>
                ) : <div className="text-[12px] text-[var(--text-3)]">Not translated yet.</div>}
              </div>
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t border-[var(--border)]">
              <button className={btn} disabled={busy !== null}
                onClick={async () => { const j = await action({ action: "retranslate", id: open.id }, "re"); if (j?.job) { setOpen(j.job); load(); } }}>
                {busy === "re" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Translate again
              </button>
              <button className={btn} disabled={busy !== null || (open.status !== "done" && open.status !== "failed")}
                onClick={async () => { const j = await action({ action: "resend", id: open.id }, "send"); if (j?.job) { setOpen(j.job); load(); } }}>
                {busy === "send" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Resend to WordPress
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
