"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, AlertTriangle, Power, RefreshCw } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Status = {
  state: "running" | "idle" | "stuck" | "error" | "never";
  started_at?: string;
  completed_at?: string | null;
  age_ms?: number;
  trigger?: "cron" | "manual" | "unknown";
  duration_ms?: number | null;
  signals_inserted?: number | null;
  trends_created?: number | null;
  error_message?: string | null;
};

const POLL_MS = 15_000;
const AUTO_TRIGGER_MS = 5 * 60 * 1000; // 5 minutes (mirrors vercel.json cron)
const AUTO_TRIGGER_FROM_NEVER_MS = 10_000; // also kick off if no run has ever happened

export function IngestStatus() {
  const [status, setStatus] = useState<Status>({ state: "never" });
  const [now, setNow] = useState(() => Date.now());
  const [triggering, setTriggering] = useState(false);
  const lastTriggerRef = useRef(0);

  const trigger = useCallback(async () => {
    // Soft client-side debounce against multiple tabs / rapid clicks
    if (Date.now() - lastTriggerRef.current < 30_000) return;
    lastTriggerRef.current = Date.now();
    setTriggering(true);
    try {
      await fetch("/api/dev/ingest", { cache: "no-store" });
    } catch {
      /* ignore */
    } finally {
      setTriggering(false);
    }
  }, []);

  useEffect(() => {
    let stop = false;
    let lastSeenIdle = 0;

    async function poll() {
      try {
        const res = await fetch("/api/cron/status", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Status;
        if (stop) return;
        setStatus(json);

        // Client-side auto-trigger disabled — the masthead used to fire an
        // ingest if no run had completed in 5 minutes. That's an implicit
        // cron and the user asked for ALL crons stopped. Manual "Run now"
        // button still works; status polling continues for the indicator.
        if (json.state === "idle") lastSeenIdle = Date.now();
        // Suppress unused-var warning while logic is disabled
        void AUTO_TRIGGER_MS;
        void AUTO_TRIGGER_FROM_NEVER_MS;
      } catch {
        /* ignore */
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      stop = true;
      clearInterval(id);
      clearInterval(tick);
    };
  }, [trigger]);

  const { lang } = useLang();
  const visual = render(status, now);
  const isRunning = status.state === "running" || triggering;
  const canTrigger = !isRunning;

  return (
    <div className="flex items-center gap-2">
      {/* Status pill — read-only summary of current state */}
      <div
        className="flex items-center gap-1.5 text-xs font-medium rounded px-2 py-1"
        style={{ color: visual.color }}
        title={visual.tooltip}
      >
        {visual.icon}
        <span>{visual.label}</span>
      </div>

      {/* Dedicated manual-run button */}
      <button
        onClick={canTrigger ? trigger : undefined}
        disabled={!canTrigger}
        className={`flex items-center gap-1.5 text-xs font-medium rounded px-2.5 py-1 border transition-colors ${
          canTrigger
            ? "bg-[var(--text)] text-white border-[var(--text)] hover:bg-black cursor-pointer"
            : "bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] cursor-not-allowed"
        }`}
        title={
          canTrigger
            ? lang === "hi"
              ? "अभी एक इनजेस्ट चलाएँ"
              : "Run an ingest now"
            : lang === "hi"
            ? "इनजेस्ट चल रहा है"
            : "Ingest is running"
        }
      >
        {isRunning ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <RefreshCw size={12} />
        )}
        <span>{lang === "hi" ? "अभी चलाएँ" : "Run now"}</span>
      </button>
    </div>
  );
}

function render(s: Status, now: number) {
  switch (s.state) {
    case "running": {
      const elapsed = s.started_at
        ? Math.max(0, Math.round((now - new Date(s.started_at).getTime()) / 1000))
        : 0;
      return {
        color: "var(--blue)",
        icon: <Loader2 size={13} className="animate-spin" />,
        label: `Updating · ${elapsed}s`,
        tooltip: `Ingestion in progress (started ${elapsed}s ago, trigger: ${s.trigger ?? "?"})`,
      };
    }
    case "idle": {
      const ref = s.completed_at ?? s.started_at;
      const ageMs = ref ? now - new Date(ref).getTime() : 0;
      return {
        color: "var(--green)",
        icon: <CheckCircle2 size={13} />,
        label: `Updated ${formatAge(ageMs)}`,
        tooltip: `Last run: ${s.signals_inserted ?? 0} new signals, ${s.trends_created ?? 0} trends · ${
          s.duration_ms ?? "?"
        }ms · trigger ${s.trigger ?? "?"}`,
      };
    }
    case "stuck": {
      const elapsed = s.started_at
        ? Math.round((now - new Date(s.started_at).getTime()) / 60000)
        : 0;
      return {
        color: "var(--amber)",
        icon: <AlertTriangle size={13} />,
        label: `Stuck · ${elapsed}m`,
        tooltip: `Last run started ${elapsed} min ago and hasn't finished. Check server logs.`,
      };
    }
    case "error": {
      const ref = s.completed_at ?? s.started_at;
      const ageMs = ref ? now - new Date(ref).getTime() : 0;
      return {
        color: "var(--red)",
        icon: <AlertCircle size={13} />,
        label: `Error · ${formatAge(ageMs)}`,
        tooltip: s.error_message ?? "Last ingest failed. See logs.",
      };
    }
    case "never":
    default:
      return {
        color: "var(--text-3)",
        icon: <Power size={13} />,
        label: "Never run",
        tooltip: "No ingestion has run yet. Trigger /api/dev/ingest manually.",
      };
  }
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}
