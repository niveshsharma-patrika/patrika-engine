import { runSocialSync } from "@/lib/social/sync";

export const maxDuration = 280;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/social — periodic sync of tracked social accounts.
 * Separate cron from news + Twitter. Authenticates with CRON_SECRET.
 * Scheduled by deploy/cron-social.sh (hourly is plenty — engagement is slow).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || auth !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const result = await runSocialSync("cron");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
