import type { SupabaseClient } from "@supabase/supabase-js";

import { enrichFromUrl } from "./json-ld";

/**
 * Bulk-enrich pending signals: any signal where `enriched_at IS NULL`
 * AND `enrich_failed = false` AND it has a URL gets one GET attempt.
 * Failures are marked `enrich_failed = true` so we don't retry the same
 * dead URL on every tick.
 *
 * Capped per-tick to leave budget for the embed/cluster/polish steps that
 * follow. With CONCURRENCY=12 and avg ~600ms per fetch, MAX_PER_RUN=500
 * runs in ~25s.
 */

const MAX_PER_RUN = 500;
const CONCURRENCY = 12;

export type EnrichStats = {
  pending_before: number;
  enriched: number;
  failed: number;
  duration_ms: number;
};

export async function enrichPendingSignals(
  supabase: SupabaseClient
): Promise<EnrichStats> {
  const started = Date.now();

  const { count: pendingBefore } = await supabase
    .from("signals")
    .select("id", { count: "exact", head: true })
    .is("enriched_at", null)
    .eq("enrich_failed", false)
    .not("url", "is", null);

  const { data: rows, error } = await supabase
    .from("signals")
    .select("id, url, metadata")
    .is("enriched_at", null)
    .eq("enrich_failed", false)
    .not("url", "is", null)
    .order("published_at", { ascending: false })
    .limit(MAX_PER_RUN);

  if (error) {
    throw new Error(`enrich: fetch pending failed: ${error.message}`);
  }

  type PendingRow = { id: string; url: string; metadata: Record<string, unknown> | null };
  const pending = ((rows as PendingRow[] | null) ?? []);

  let enriched = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  const queue = [...pending];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const row = queue.shift();
        if (!row) break;
        let data;
        try {
          data = await enrichFromUrl(row.url);
        } catch {
          data = null;
        }
        if (!data) {
          await supabase
            .from("signals")
            .update({ enrich_failed: true })
            .eq("id", row.id);
          failed += 1;
          continue;
        }
        // Merge an og:image / JSON-LD image into metadata, but never
        // overwrite an image the RSS feed already gave us.
        const existingMeta = (row.metadata ?? {}) as Record<string, unknown>;
        const update: Record<string, unknown> = {
          description: data.description,
          keywords: data.keywords.length > 0 ? data.keywords : null,
          publisher_section: data.publisher_section,
          enriched_at: nowIso,
        };
        if (data.image && !existingMeta.image) {
          update.metadata = { ...existingMeta, image: data.image };
        }
        const { error: uErr } = await supabase
          .from("signals")
          .update(update)
          .eq("id", row.id);
        if (uErr) {
          failed += 1;
          continue;
        }
        enriched += 1;
      }
    })
  );

  return {
    pending_before: pendingBefore ?? pending.length,
    enriched,
    failed,
    duration_ms: Date.now() - started,
  };
}
