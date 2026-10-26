import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { confinedFor } from "@/lib/auth/confined";
import { featureForPath, digitalEdition } from "@/lib/features";
import { resolveFeatureFlags, canAccessFeature } from "@/lib/feature-flags";

/**
 * Per-page feature gate. Call at the top of a controllable page's server
 * component. Unlike the root layout (which Next does NOT re-run on client-side
 * navigation), a page re-renders on every navigation — so this blocks a
 * disabled / role- or edition-restricted feature for real, on soft nav too.
 *
 * Confined roles are governed by their own mechanism (middleware + /locked) and
 * are skipped here. The user's home page (dashboard for digital, /today for
 * print) is never blocked, so a blocked redirect can't loop.
 */
export async function requireFeatureAccess(): Promise<void> {
  const session = await getSession();
  if (!session) return; // unauthenticated → middleware/layout already handle it
  if (confinedFor(session.role)) return; // confined print/olloi → own mechanism

  const pathname = (await headers()).get("x-pathname") ?? "";
  const feature = featureForPath(pathname);
  if (!feature) return;

  const edition = digitalEdition(session.role, session.edition);
  const safeHome = edition === "print" ? "/print" : "/";
  if (feature.href === safeHome) return; // always-reachable landing — no loop

  const flags = await resolveFeatureFlags();
  if (!canAccessFeature(flags[feature.key], feature, session.role, edition)) {
    redirect(safeHome);
  }
}
