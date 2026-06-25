import { ingestAllRss } from "@/lib/ingest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Dev-only manual trigger for ingestion. Disabled in production.
 * Hit GET /api/dev/ingest from your browser (or click "Run now" in the UI)
 * to run a sync now.
 *
 * Runs the full pipeline — fetch + enrich + no-AI clustering — exactly like
 * the cron tick, just without the bearer-token check so it's easy to call
 * locally.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "Not available in production. Use /api/cron/ingest with bearer token." },
      { status: 403 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return Response.json(
      {
        error:
          "Database not configured. Set DATABASE_URL in .env first.",
      },
      { status: 503 }
    );
  }

  try {
    const result = await ingestAllRss("manual");
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
