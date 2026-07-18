"use client";

import { useState, useTransition } from "react";

export type PipelineRow = {
  key: "fetch" | "enrich" | "cluster";
  enabled: boolean;
  label: string;
  description: string | null;
  updated_at: string;
};

type Props = {
  rows: PipelineRow[];
  // Only whether a stage is env-locked — not the env-var name (no server config
  // detail crosses to the client).
  envOverrides: Partial<Record<PipelineRow["key"], boolean>>;
};

// Every stage is free now — clustering is pure text math (no AI). The
// "Cost" column stays so the newsroom can see at a glance that nothing
// here bills, and so a future optional AI-assist stage has a home.
const PAID_KEYS = new Set<PipelineRow["key"]>([]);

export function PipelineSwitches({ rows, envOverrides }: Props) {
  const [state, setState] = useState(rows);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  async function toggle(key: PipelineRow["key"], next: boolean) {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch("/api/admin/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled: next }),
      });
      if (res.ok) {
        startTransition(() => {
          setState((prev) =>
            prev.map((r) =>
              r.key === key
                ? { ...r, enabled: next, updated_at: new Date().toISOString() }
                : r
            )
          );
        });
      }
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  return (
    <div className="bg-white border border-[var(--border)] rounded-md overflow-hidden">
      <div className="grid grid-cols-[1fr_140px_110px] gap-3.5 px-4 py-2.5 bg-[var(--surface-2)] text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium">
        <div>Stage</div>
        <div>Cost</div>
        <div className="text-right">State</div>
      </div>

      {state.map((row) => {
        const isPaid = PAID_KEYS.has(row.key);
        const override = envOverrides[row.key];
        const effective = override ? false : row.enabled;
        const disabled = !!override || busy[row.key];

        return (
          <div
            key={row.key}
            className="grid grid-cols-[1fr_140px_110px] gap-3.5 px-4 py-3 items-center border-t border-[var(--border)]"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium flex items-center gap-2">
                <span>{row.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)] bg-[var(--surface-2)] px-1.5 py-px rounded">
                  {row.key}
                </span>
              </div>
              {row.description && (
                <div className="text-[11.5px] text-[var(--text-3)] mt-0.5 leading-snug">
                  {row.description}
                </div>
              )}
              {override && (
                <div className="text-[11px] text-[var(--red)] mt-1">
                  Forced OFF by a server setting
                </div>
              )}
            </div>

            <div>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  isPaid
                    ? "bg-[var(--orange-soft)] text-[#b06000]"
                    : "bg-[var(--green-soft)] text-[var(--green)]"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {isPaid ? "Paid AI" : "Free"}
              </span>
            </div>

            <div className="text-right">
              <button
                onClick={() => toggle(row.key, !row.enabled)}
                disabled={disabled}
                aria-pressed={effective}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  effective
                    ? "bg-[var(--green)]"
                    : "bg-[var(--surface-2)] border border-[var(--border)]"
                } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                title={
                  override
                    ? "Cannot toggle — locked by a server setting"
                    : effective
                    ? "Click to disable"
                    : "Click to enable"
                }
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    effective ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
