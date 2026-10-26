"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, KeyRound, Copy, Check, X, AlertTriangle, CheckCircle2 } from "lucide-react";

type Flag = { type: string; unit?: string; detail: string };
type Row = {
  id: string; title: string; title_en: string | null; status: string; review: string | null;
  flags: Flag[]; model: string | null; error: string | null; duration_ms: number | null;
  created_at: string; completed_at: string | null;
};
type Article = { title: string; excerpt: string; content: string };
type Full = Row & { source: Article; result: Article | null };
type KeyStatus = { apiKeySet: boolean; apiKeyUpdatedAt: string | null };

const fmt = (ts: string | null) => (ts ? new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function StatusBadge({ r }: { r: Row }) {
  const [label, cls] =
    r.status === "done" && r.review === "ok" ? ["Checked · OK", "bg-[#dcfce7] text-[#166534]"]
    : r.status === "done" ? [`Needs review · ${r.flags.length}`, "bg-[#fef3c7] text-[#92400e]"]
    : r.status === "failed" ? ["Failed", "bg-[var(--red-soft)] text-[var(--red)]"]
    : ["Translating…", "bg-[var(--surface-2)] text-[var(--text-2)]"];
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
}

function Side({ label, a }: { label: string; a: Article | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-3)] mb-1">{label}</div>
      {a ? (
        <>
          {a.title && <h3 className="text-[15px] font-semibold leading-snug mb-1">{a.title}</h3>}
          {a.excerpt && <p className="text-[12.5px] text-[var(--text-2)] mb-2">{a.excerpt}</p>}
          {a.content && <pre className="text-[12px] whitespace-pre-wrap font-sans leading-relaxed bg-[var(--surface-2)] rounded p-2">{a.content}</pre>}
        </>
      ) : <div className="text-[12px] text-[var(--text-3)]">—</div>}
    </div>
  );
}

/** Admin → Translations: the WordPress API key + every article translated, side by side with its flags. */
export function TranslationLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [key, setKey] = useState<KeyStatus | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Full | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/translations", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      setRows(j.rows); setHasMore(j.hasMore); setKey(j.key);
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
    if (r.ok) { setRows((p) => [...p, ...j.rows]); setHasMore(j.hasMore); }
  }

  async function openRow(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/translations?id=${id}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) setOpen(j.row); else setError(j.error ?? "Failed");
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function generateKey() {
    if (key?.apiKeySet && !confirm("Generate a new key? The current key stops working immediately.")) return;
    setBusy("key"); setError(null);
    try {
      const r = await fetch("/api/admin/translations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rotate_key" }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); return; }
      setNewKey(j.apiKey); setCopied(false); load();
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  const btn = "inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded border border-[var(--border)] bg-white hover:border-[var(--text-3)] disabled:opacity-50";

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-medium mb-1">Translations</h1>
      <p className="text-[13px] text-[var(--text-3)] mb-5">
        Hindi → English translation API for WordPress. Every article is translated under the accuracy rules (nothing added, nothing dropped, figures and names exact), then checked. Anything a check finds is listed here as <b>Needs review</b>.
      </p>

      <div className="bg-white border border-[var(--border)] rounded-md p-4 mb-6 max-w-xl">
        <h3 className="text-[13px] font-semibold mb-1 flex items-center gap-1.5"><KeyRound size={14} /> API key for WordPress</h3>
        <p className="text-[11.5px] text-[var(--text-3)] mb-3">WordPress sends it as the <code className="font-mono">X-API-Key</code> header. Generating a new key stops the old one immediately.</p>
        <div className="text-[12px] text-[var(--text-2)] mb-3">{key?.apiKeySet ? `Set · last changed ${fmt(key.apiKeyUpdatedAt)}` : "Not set yet"}</div>
        {newKey ? (
          <div className="bg-[#fef3c7] border border-[#fcd34d] rounded p-2.5">
            <div className="text-[11.5px] text-[#92400e] mb-1.5 font-medium">Copy this now — it won&rsquo;t be shown again.</div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-[11.5px] break-all flex-1">{newKey}</code>
              <button className={btn} onClick={() => { navigator.clipboard.writeText(newKey); setCopied(true); }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
            </div>
          </div>
        ) : (
          <button className={btn} disabled={busy === "key"} onClick={generateKey}>
            {busy === "key" ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} {key?.apiKeySet ? "Generate new key" : "Generate key"}
          </button>
        )}
      </div>

      {error && <div className="flex items-center gap-2 text-[13px] text-[var(--red)] mb-3"><AlertTriangle size={14} /> {error}</div>}

      <div className={`grid gap-4 ${open ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" : "grid-cols-1"}`}>
        <div>
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-3)] py-16 justify-center"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-[13px] text-[var(--text-3)] py-16 text-center border border-dashed border-[var(--border)] rounded-md">No articles translated yet.</div>
          ) : (
            <>
              <ul className="bg-white border border-[var(--border)] rounded-md divide-y divide-[var(--border)]">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => openRow(r.id)} className={`w-full text-left px-4 py-3 hover:bg-[var(--surface-2)] ${open?.id === r.id ? "bg-[var(--surface-2)]" : ""}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-medium truncate">{r.title || "(no title)"}</div>
                          {r.title_en && <div className="text-[12.5px] text-[var(--text-2)] truncate">{r.title_en}</div>}
                          <div className="text-[11px] text-[var(--text-3)] mt-0.5 flex gap-2">
                            <span>{fmt(r.created_at)}</span>
                            {r.duration_ms != null && <span>{Math.round(r.duration_ms / 1000)}s</span>}
                          </div>
                        </div>
                        {busy === r.id ? <Loader2 size={13} className="animate-spin text-[var(--text-3)]" /> : <StatusBadge r={r} />}
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
              <div className="text-[11.5px] text-[var(--text-3)] flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusBadge r={open} /><span>{fmt(open.created_at)}</span>{open.model && <span>{open.model}</span>}
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
              <Side label="Hindi (received)" a={open.source} />
              <Side label="English (returned)" a={open.result} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
