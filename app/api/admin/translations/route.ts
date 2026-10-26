import { getSession } from "@/lib/auth/session";
import { isValidCallbackUrl, rotateApiKey, setCallbackUrl, translationSettingsStatus } from "@/lib/translate/config";
import { deliverCallback, getJob, listJobs, processJob, requeue, resetCallback } from "@/lib/translate/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const s = await getSession();
  return s?.role === "admin" ? s : null;
}

/** GET /api/admin/translations[?id=|?before=] — the translation log + settings. Admin only. */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  try {
    if (id) {
      if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
      const job = await getJob(id);
      return job ? Response.json({ job }) : Response.json({ error: "Not found" }, { status: 404 });
    }
    const before = sp.get("before") ?? undefined;
    const rows = await listJobs(50, before);
    // The list omits the (large) article bodies; the detail view loads them.
    const jobs = rows.map(({ source, result, ...j }) => ({ ...j, title: source?.title ?? "", title_en: result?.title ?? null }));
    return Response.json({ jobs, hasMore: rows.length === 50, settings: before ? undefined : await translationSettingsStatus() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/admin/translations — admin actions:
 *   { action: "rotate_key" }                → new API key (returned ONCE)
 *   { action: "set_callback", url }         → set the callback URL
 *   { action: "retranslate", id }           → translate again + resend
 *   { action: "resend", id }                → resend the callback only
 */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.KEY_ENCRYPTION_SECRET) {
    return Response.json({ error: "KEY_ENCRYPTION_SECRET is not set on the server — cannot store credentials." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : null;
  try {
    switch (action) {
      case "rotate_key":
        return Response.json({ ok: true, apiKey: await rotateApiKey() });
      case "set_callback": {
        const url = typeof body?.url === "string" ? body.url.trim() : "";
        if (!isValidCallbackUrl(url)) return Response.json({ error: "Enter a full https:// URL." }, { status: 400 });
        await setCallbackUrl(url);
        return Response.json({ ok: true });
      }
      case "retranslate":
        if (!id) return Response.json({ error: "Bad id" }, { status: 400 });
        await requeue(id);
        await processJob(id);
        return Response.json({ ok: true, job: await getJob(id) });
      case "resend":
        if (!id) return Response.json({ error: "Bad id" }, { status: 400 });
        await resetCallback(id);
        return Response.json({ ok: await deliverCallback(id), job: await getJob(id) });
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
