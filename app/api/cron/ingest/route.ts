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
  // Require the shared secret UNCONDITIONALLY. The old `x-vercel-cron` header
  // shortcut was a Vercel-only trust signal; on the Azure/nginx deployment that
  // header is caller-spoofable, so it must never bypass auth. Both the scheduled
  // cron and the dev timer already send `Authorization: Bearer $CRON_SECRET`.
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (!expected || auth !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  try {
    const result = await ingestAllRss("cron");
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
