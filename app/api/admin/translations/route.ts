import { getSession } from "@/lib/auth/session";
import { rotateApiKey, translationKeyStatus } from "@/lib/translate/config";
import { getLog, listLogs } from "@/lib/translate/log";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 50;

async function requireAdmin() {
  const s = await getSession();
  return s?.role === "admin" ? s : null;
}

/** GET /api/admin/translations[?id=|?before=] — the translation log + key status. Admin only. */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  try {
    if (id) {
      const row = UUID.test(id) ? await getLog(id) : null;
      return row ? Response.json({ row }) : Response.json({ error: "Not found" }, { status: 404 });
    }
    const before = sp.get("before") ?? undefined;
    const rows = await listLogs(PAGE, before);
    // The list omits the (large) article bodies; the detail view loads them.
    const list = rows.map(({ source, result, ...r }) => ({ ...r, title: source?.title || source?.excerpt || "", title_en: result?.title ?? null }));
    return Response.json({ rows: list, hasMore: rows.length === PAGE, key: before ? undefined : await translationKeyStatus() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/** POST /api/admin/translations { action: "rotate_key" } → a new API key (returned ONCE). */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.KEY_ENCRYPTION_SECRET) {
    return Response.json({ error: "KEY_ENCRYPTION_SECRET is not set on the server — cannot store credentials." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  if (body?.action !== "rotate_key") return Response.json({ error: "Unknown action" }, { status: 400 });
  try {
    return Response.json({ ok: true, apiKey: await rotateApiKey() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
