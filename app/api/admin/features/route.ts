import { getSession } from "@/lib/auth/session";
import { FEATURES, isLockedFeature } from "@/lib/features";
import { resolveFeatureFlags, setFeatureFlags } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

/** GET — feature metadata + current resolved flags, for the control panel. */
export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({
    features: FEATURES.map((f) => ({
      key: f.key,
      href: f.href,
      defaultRoles: f.defaultRoles,
      defaultEditions: f.defaultEditions,
      locked: isLockedFeature(f), // Features page + dashboard: not editable
    })),
    flags: await resolveFeatureFlags(),
  });
}

/** PUT — save flags. Body: { flags: { key: { enabled, roles[], editions[] } } }.
 *  Roles/editions are clamped to each feature's defaults server-side, so a flag
 *  can only narrow visibility, never grant beyond the baseline. Admin only. */
export async function PUT(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const flags = body?.flags;
  if (!flags || typeof flags !== "object") return Response.json({ error: "Invalid body" }, { status: 400 });

  try {
    await setFeatureFlags(flags as Record<string, { enabled?: unknown; roles?: unknown; editions?: unknown }>);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to save" }, { status: 500 });
  }
}
