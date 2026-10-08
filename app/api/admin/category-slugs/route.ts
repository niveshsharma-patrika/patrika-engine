import { getSession } from "@/lib/auth/session";
import { getAllCategorySlugs, setCategorySlugs, PATRIKA_PLUS_SLUG_KEY } from "@/lib/cms-categories";
import { MAGAZINES } from "@/lib/magazines";

export const dynamic = "force-dynamic";

const PATRIKA_DESKS = new Set(
  MAGAZINES.filter((m) => (m.group ?? "patrika") === "patrika" && m.key !== "custom").map((m) => m.key)
);

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

/** GET — current desk → CMS slug mappings. Admin only. */
export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ slugs: await getAllCategorySlugs() });
}

/** PUT — save desk → CMS slug mappings. Admin only. Body: { slugs: {desk: slug} }.
 *  Only known Patrika+ desk keys are accepted. */
export async function PUT(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const slugs = body?.slugs;
  if (!slugs || typeof slugs !== "object") return Response.json({ error: "Invalid body" }, { status: 400 });

  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(slugs as Record<string, unknown>)) {
    if ((PATRIKA_DESKS.has(k) || k === PATRIKA_PLUS_SLUG_KEY) && typeof v === "string") clean[k] = v.trim();
  }
  if (Object.keys(clean).length === 0) return Response.json({ error: "Nothing to save" }, { status: 400 });

  try {
    await setCategorySlugs(clean);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to save" }, { status: 500 });
  }
}
