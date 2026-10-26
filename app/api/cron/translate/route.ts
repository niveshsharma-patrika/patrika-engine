import { sweep } from "@/lib/translate/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/translate — recovery sweep for the translation API: resumes
 * jobs a restart interrupted and re-delivers callbacks WordPress didn't accept.
 * CRON_SECRET auth. Scheduled every 5 min by deploy/cron-translate.sh.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || req.headers.get("authorization") !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await sweep()) });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
