import { cache } from "react";

import { pool } from "@/lib/db";
import type { Edition } from "@/lib/auth/jwt";
import { FEATURES, FEATURE_BY_KEY, isLockedFeature, type ControlRole, type Feature } from "@/lib/features";

/**
 * Feature visibility flags (table feature_flags, edited in Admin → Features).
 * Resolution merges DB rows over the code defaults in lib/features.ts, and the
 * stored roles/editions are intersected with each feature's defaults so a flag
 * can only RESTRICT access, never grant beyond the baseline.
 */

export type FeatureFlag = { enabled: boolean; roles: ControlRole[]; editions: Edition[] };
export type ResolvedFlags = Record<string, FeatureFlag>;

function defaultFlag(f: Feature): FeatureFlag {
  return { enabled: true, roles: [...f.defaultRoles], editions: [...f.defaultEditions] };
}

function clampRoles(f: Feature, roles: readonly string[] | null | undefined): ControlRole[] {
  return (roles ?? []).filter((x): x is ControlRole => f.defaultRoles.includes(x as ControlRole));
}
function clampEditions(f: Feature, editions: readonly string[] | null | undefined): Edition[] {
  return (editions ?? []).filter((x): x is Edition => f.defaultEditions.includes(x as Edition));
}

/** Resolved flag for every feature (DB over defaults). Request-cached so the
 *  layout, the per-page guards and the admin API share a single query. */
export const resolveFeatureFlags = cache(async (): Promise<ResolvedFlags> => {
  const out: ResolvedFlags = {};
  for (const f of FEATURES) out[f.key] = defaultFlag(f);
  try {
    const { rows } = await pool.query<{ feature_key: string; enabled: boolean; roles: string[]; editions: string[] }>(
      `SELECT feature_key, enabled, roles, editions FROM feature_flags`
    );
    for (const r of rows) {
      const f = FEATURE_BY_KEY[r.feature_key];
      if (!f || isLockedFeature(f)) continue; // locked features always use defaults
      out[f.key] = {
        enabled: Boolean(r.enabled),
        roles: clampRoles(f, r.roles),
        editions: clampEditions(f, r.editions),
      };
    }
  } catch {
    /* table not migrated yet → code defaults */
  }
  return out;
});

/** Save a batch of flags. Unknown keys ignored; roles/editions clamped to the
 *  feature's defaults; protected features stay enabled. */
export async function setFeatureFlags(
  map: Record<string, { enabled?: unknown; roles?: unknown; editions?: unknown }>
): Promise<void> {
  for (const [key, v] of Object.entries(map)) {
    const f = FEATURE_BY_KEY[key];
    if (!f || isLockedFeature(f) || !v || typeof v !== "object") continue; // locked: never modified
    const roles = clampRoles(f, Array.isArray(v.roles) ? (v.roles as string[]) : []);
    const editions = clampEditions(f, Array.isArray(v.editions) ? (v.editions as string[]) : []);
    const enabled = f.isProtected ? true : Boolean(v.enabled);
    await pool.query(
      `INSERT INTO feature_flags (feature_key, enabled, roles, editions, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (feature_key) DO UPDATE
         SET enabled = EXCLUDED.enabled, roles = EXCLUDED.roles, editions = EXCLUDED.editions, updated_at = now()`,
      [key, enabled, roles, editions]
    );
  }
}

// Pure access check lives in lib/features.ts (client-safe); re-exported here so
// server callers keep importing it from the flags module.
export { canAccessFeature } from "@/lib/features";
