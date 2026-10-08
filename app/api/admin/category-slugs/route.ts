import { getSession } from "@/lib/auth/session";
import { getAllCategorySlugs, setCategorySlugs, type DeskCategories } from "@/lib/cms-categories";
import { MAGAZINES } from "@/lib/magazines";

export const dynamic = "force-dynamic";

const PATRIKA_DESKS = new Set(
  MAGAZINES.filter((m) => (m.group ?? "patrika") === "patrika" && m.key !== "custom").map((m) => m.key)
);

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

/** GET — current desk → {slug, ppSlug} mappings. Admin only. */
export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ mappings: await getAllCategorySlugs() });
}

/** PUT — save desk → {slug, ppSlug} mappings. Admin only.
 *  Body: { mappings: { desk: { slug, ppSlug } } }. Only known Patrika+ desk
 *  keys are accepted; slug = global category, ppSlug = Patrika Plus category. */
export async function PUT(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const mappings = body?.mappings;
  if (!mappings || typeof mappings !== "object") return Response.json({ error: "Invalid body" }, { status: 400 });

  const clean: Record<string, DeskCategories> = {};
  for (const [k, v] of Object.entries(mappings as Record<string, unknown>)) {
    if (!PATRIKA_DESKS.has(k) || !v || typeof v !== "object") continue;
    const o = v as { slug?: unknown; ppSlug?: unknown };
    clean[k] = {
      slug: typeof o.slug === "string" ? o.slug.trim() : "",
      ppSlug: typeof o.ppSlug === "string" ? o.ppSlug.trim() : "",
    };
  }
  if (Object.keys(clean).length === 0) return Response.json({ error: "Nothing to save" }, { status: 400 });

  try {
    await setCategorySlugs(clean);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to save" }, { status: 500 });
  }
}
