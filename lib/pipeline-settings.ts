import type { DbClient as SupabaseClient } from "@/lib/db/compat";

/**
 * Pipeline switches: per-stage on/off flags read from the
 * `pipeline_settings` Postgres table, with env-var overrides on top.
 *
 * Why two layers:
 *   - DB row = the persistent default. Operator flips toggles from the
 *     admin UI; setting survives restarts.
 *   - Env var = emergency stop. SKIP_FETCH=1 / SKIP_CLUSTER=1 force the
 *     corresponding stage OFF regardless of what the DB says. The
 *     kill-switch is one-directional (you can override OFF, but not ON).
 *
 * Stages:
 *   fetch   — RSS / sitemap / Google News pull + URL-level dedup
 *   enrich  — JSON-LD enrichment over each article URL
 *   cluster — no-AI lexical clustering → trend rows (free, pure text math)
 *
 * There are no paid AI stages here: clustering uses lib/clustering/lexical.ts,
 * not embeddings or an LLM. All three default ON.
 */

export type PipelineStageKey = "fetch" | "enrich" | "cluster";

export type PipelineSettings = Record<PipelineStageKey, boolean>;

const DEFAULTS: PipelineSettings = {
  fetch: true,
  enrich: true,
  cluster: true,
};

/**
 * Read pipeline_settings from DB. Falls back to DEFAULTS for any row
 * missing in the table (e.g. fresh dev DB where migration 0020 hasn't
 * been applied yet — pipeline keeps working with the safe defaults).
 * Then applies env-var overrides: SKIP_FETCH=1 forces fetch off,
 * SKIP_CLUSTER=1 forces cluster off.
 */
export async function getPipelineSettings(
  supabase: SupabaseClient
): Promise<PipelineSettings> {
  const settings: PipelineSettings = { ...DEFAULTS };

  try {
    const { data } = await supabase
      .from("pipeline_settings")
      .select("key, enabled");

    type Row = { key: string; enabled: boolean };
    for (const row of (data as Row[] | null) ?? []) {
      if (row.key in settings) {
        settings[row.key as PipelineStageKey] = row.enabled;
      }
    }
  } catch {
    // Table missing or transient failure — use defaults. Don't block ingest.
  }

  // Env overrides — kill-switches always win.
  if (process.env.SKIP_FETCH === "1") settings.fetch = false;
  if (process.env.SKIP_CLUSTER === "1") settings.cluster = false;

  return settings;
}

/**
 * For the admin UI: which stages are currently forced off by env?
 * Used to disable the toggle in the UI and explain why a flip didn't
 * take effect.
 */
export function envOverrides(): Partial<Record<PipelineStageKey, boolean>> {
  // Return only WHETHER a stage is env-locked — never the env-var name — so no
  // server-config detail reaches the (client) admin UI.
  const out: Partial<Record<PipelineStageKey, boolean>> = {};
  if (process.env.SKIP_FETCH === "1") out.fetch = true;
  if (process.env.SKIP_CLUSTER === "1") out.cluster = true;
  return out;
}
