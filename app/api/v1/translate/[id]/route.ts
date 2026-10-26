import { checkApiKey } from "@/lib/translate/config";
import { getJob, publicView } from "@/lib/translate/jobs";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/v1/translate/:job_id — status + result (fallback if a callback was missed). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkApiKey(req.headers.get("x-api-key")))) {
    return Response.json({ error: "Invalid or missing X-API-Key." }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(publicView(job));
}
