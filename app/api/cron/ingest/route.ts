import { ingestAllRss } from "@/lib/ingest";

// Allow up to 5 minutes — Vercel Fluid Compute default is 300s.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Vercel cron endpoint. Configured in vercel.json.
 *
 * Auth: accepts either:
 *   - The `x-vercel-cron` header (set by Vercel's cron runner)
 *   - `Authorization: Bearer <CRON_SECRET>` (for manual invocation)
 */
export async function GET(req: Request) {
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;

  if (!isVercelCron && (!expected || auth !== expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  try {
    const result = await ingestAllRss(isVercelCron ? "cron" : "manual");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
