"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";

type Option = { value: string; default: string; directive: string; customized: boolean };
type Control = { key: string; label: string; options: Option[] };

const keyOf = (control: string, value: string) => `${control}::${value}`;

export default function DirectivesPage() {
  const [controls, setControls] = useState<Control[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const d = await fetch("/api/directives", { cache: "no-store" }).then((r) => r.json());
      setControls(d.controls ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Effective text = the in-progress draft if edited, else the stored directive.
  const effective = (ck: string, o: Option) => drafts[keyOf(ck, o.value)] ?? o.directive;

  // Which drafts actually differ from what's stored (i.e. real unsaved edits).
  const pending = useMemo(() => {
    const stored = new Map<string, string>();
    for (const c of controls) for (const o of c.options) stored.set(keyOf(c.key, o.value), o.directive);
    return Object.entries(drafts).filter(([k, v]) => stored.has(k) && v !== stored.get(k));
  }, [drafts, controls]);

  async function save() {
    if (pending.length === 0) return;
    setSaving(true);
    setMsg(null);
    try {
      const updates = pending.map(([k, directive]) => {
        const [control, value] = k.split("::");
        return { control, value, directive };
      });
      const res = await fetch("/api/directives", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setMsg(e.error ?? "Save failed.");
        return;
      }
      setDrafts({});
      await load();
      setMsg("Saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-[var(--text-3)] text-sm">Loading writing directives…</div>;
  }

  return (
    <>
      <div className="flex items-start justify-between gap-6 pb-4 mb-6 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-medium">Writing Directives</h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1 max-w-2xl">
            The exact prompt text each generation control expands into when a draft is written.
            Edit any of these to change how the AI writes; leave one blank (or unchanged) to fall
            back to the built-in default.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {msg && <span className="text-[12px] text-[var(--text-3)]">{msg}</span>}
          <button
            onClick={save}
            disabled={saving || pending.length === 0}
            className="bg-[var(--red)] hover:bg-[var(--red-hover)] text-white text-[13px] font-medium px-4 py-2 rounded disabled:opacity-40 disabled:cursor-default"
          >
            {saving
              ? "Saving…"
              : pending.length
                ? `Save ${pending.length} change${pending.length > 1 ? "s" : ""}`
                : "Saved"}
          </button>
        </div>
      </div>

      <div className="space-y-3 max-w-3xl">
        {controls.map((c) => {
          const custom = c.options.filter((o) => effective(c.key, o) !== o.default).length;
          const isOpen = open[c.key] ?? false;
          return (
            <div key={c.key} className="bg-white border border-[var(--border)] rounded-md overflow-hidden">
              <button
                onClick={() => setOpen((p) => ({ ...p, [c.key]: !isOpen }))}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--surface-2)]"
              >
                {isOpen ? <ChevronDown size={16} className="text-[var(--text-3)]" /> : <ChevronRight size={16} className="text-[var(--text-3)]" />}
                <span className="font-medium text-sm">{c.label}</span>
                <span className="text-[11px] text-[var(--text-3)]">{c.options.length} options</span>
                {custom > 0 && (
                  <span className="ml-auto text-[11px] font-medium text-[var(--red)] bg-[var(--red-soft)] px-2 py-0.5 rounded-full">
                    {custom} customised
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                  {c.options.map((o) => {
                    const val = effective(c.key, o);
                    const isCustom = val !== o.default;
                    return (
                      <div key={o.value} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-mono text-[12px] font-medium text-[var(--text)]">{o.value}</span>
                          {isCustom && (
                            <span className="text-[10px] uppercase tracking-wider text-[var(--red)] font-medium">
                              customised
                            </span>
                          )}
                          {isCustom && (
                            <button
                              onClick={() => setDrafts((p) => ({ ...p, [keyOf(c.key, o.value)]: o.default }))}
                              className="ml-auto flex items-center gap-1 text-[11px] text-[var(--text-3)] hover:text-[var(--text)]"
                              title="Reset to the built-in default"
                            >
                              <RotateCcw size={11} /> reset
                            </button>
                          )}
                        </div>
                        <textarea
                          value={val}
                          onChange={(e) => setDrafts((p) => ({ ...p, [keyOf(c.key, o.value)]: e.target.value }))}
                          rows={2}
                          className="w-full text-[13px] leading-relaxed text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 outline-none focus:border-[var(--blue)] focus:bg-white resize-y"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
