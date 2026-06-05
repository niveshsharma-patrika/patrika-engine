/**
 * Next.js instrumentation hook — runs once when the server boots.
 *
 * In local dev we don't have Vercel's cron, so spin up a setInterval
 * here that hits /api/cron/ingest every 3 minutes. In production this
 * is a no-op because Vercel cron handles it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "development") return;

  // Hard off switch — set DISABLE_CRON=1 in .env.local to stop the local
  // 5-minute ingestion timer from ever starting. Manual "Run now" button
  // still works; you just won't get automatic ticks.
  if (process.env.DISABLE_CRON === "1") {
    console.log("[local-cron] disabled via DISABLE_CRON=1");
    return;
  }

  // Survive HMR / multiple register() invocations in dev.
  type G = typeof globalThis & { __patrika_local_cron_started?: boolean };
  const g = globalThis as G;
  if (g.__patrika_local_cron_started) return;
  g.__patrika_local_cron_started = true;

  const port = process.env.PORT ?? "3000";
  const url = `http://localhost:${port}/api/cron/ingest`;
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.warn(
      "[local-cron] CRON_SECRET not set — skipping local ingestion timer"
    );
    return;
  }

  async function tick() {
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${secret}` },
        // long-running ingest is fine; we don't need to wait
      });
      if (!res.ok) {
        console.warn(`[local-cron] /api/cron/ingest returned ${res.status}`);
      }
    } catch (err) {
      console.warn(
        `[local-cron] ingest tick failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // Initial run after the server is fully ready (~15s grace), then every 5 min.
  setTimeout(() => {
    tick();
    setInterval(tick, 5 * 60 * 1000);
    console.log("[local-cron] Started: /api/cron/ingest every 5 minutes (dev only)");
  }, 15_000);
}
