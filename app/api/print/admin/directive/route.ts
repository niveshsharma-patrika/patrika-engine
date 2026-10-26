import { getSession } from "@/lib/auth/session";
import { getPrintSetting, setPrintSetting } from "@/lib/print/settings";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const s = await getSession();
  return s?.role === "admin" ? s : null;
}

/** GET — the print desk's Hindi house-style directive (injected into every print draft). */
export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ value: await getPrintSetting("directive") });
}

/** PUT — save it. Body: { value } */
export async function PUT(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const value = typeof body?.value === "string" ? body.value.trim().slice(0, 4000) : "";
  try {
    await setPrintSetting("directive", value);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
