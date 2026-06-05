import { fetchRssFeed, type RawSignal } from "@/lib/sources/rss";
import { fetchSitemapNews } from "@/lib/sources/sitemap-news";
import { fetchGoogleNews } from "@/lib/sources/google-news";
import { createAdminClient } from "@/lib/supabase/server";
import { clusterAndTrend, type ClusterStats } from "@/lib/clustering";
import { enrichPendingSignals, type EnrichStats } from "@/lib/enrich";
import { getPipelineSettings } from "@/lib/pipeline-settings";

/**
 * Three-stage ingest pipeline — all free, no AI.
 *
 * Stage 1 (fetch): every cron tick (or manual "Run now" click) fetches all
 * active sources in parallel, applies URL-level dedup against the existing
 * signals table, and inserts the new rows.
 *
 * Stage 2 (enrich): best-effort JSON-LD scrape of each new article URL for
 * a description / keywords / publisher section. Improves clustering quality
 * but isn't required.
 *
 * Stage 3 (cluster): lexical (no-AI) clustering over the last few hours of
 * signals, grouping same-story articles across publishers and reusing or
 * creating trend rows. See `lib/clustering/` for the algorithm.
 *
 * Stages 2 + 3 are best-effort: if either throws, Stage 1's signal inserts
 * still stand and the next tick picks up where this one left off.
 */

type SourceRow = {
  id: string;
  name: string;
  source_type: "rss" | "twitter" | "google_news" | "sitemap_news";
  url: string | null;
  handle: string | null;
  desk: string | null;
  is_active: boolean;
};

export type IngestResult = {
  sources: Array<{
    source: string;
    fetched: number;
    inserted: number;
    error: string | null;
  }>;
  enrichment: EnrichStats | { error: string } | null;
  clustering: ClusterStats | { error: string } | null;
  // Snapshot of which pipeline stages were enabled on this tick. Useful
  // for the UI to explain why a run produced 0 trends (e.g. "clustering
  // was off").
  pipeline: {
    fetch: boolean;
    enrich: boolean;
    cluster: boolean;
  };
  duration_ms: number;
};

export async function ingestAllRss(
  trigger: "cron" | "manual" | "unknown" = "unknown"
): Promise<IngestResult> {
  const started = Date.now();
  const supabase = createAdminClient();

  // Read pipeline switches up front. Each stage below checks its own
  // boolean. DB state + env overrides are merged here so the rest of
  // the run sees one consistent view.
  const pipeline = await getPipelineSettings(supabase);

  // Create the run row up front. Best-effort: failure to insert doesn't
  // break ingestion.
  let runId: string | null = null;
  try {
    const { data } = await supabase
      .from("ingest_runs")
      .insert({ trigger, status: "running" })
      .select("id")
      .single();
    runId = (data as { id: string } | null)?.id ?? null;
  } catch {
    // ingest_runs table may not exist yet
  }

  // Stage 1 gate: fetch is OFF when either the DB toggle is false or
  // SKIP_FETCH=1 was set in env. Either case, we skip pulling new
  // signals — downstream stages still run on the existing corpus.
  const { data: sources, error: sourcesErr } = !pipeline.fetch
    ? { data: [], error: null }
    : await supabase
        .from("sources")
        .select("id, name, source_type, url, handle, desk, is_active")
        .eq("is_active", true)
        .in("source_type", ["rss", "twitter", "google_news", "sitemap_news"]);

  if (sourcesErr) {
    throw new Error(`Failed to fetch sources: ${sourcesErr.message}`);
  }

  const sourceResults: IngestResult["sources"] = [];
  const queue = [...((sources as SourceRow[] | null) ?? [])];

  async function worker() {
    while (queue.length) {
      const source = queue.shift();
      if (!source || !source.url) continue;
      try {
        const raw =
          source.source_type === "sitemap_news"
            ? await fetchSitemapNews(source.url, source.name)
            : source.source_type === "google_news"
            ? await fetchGoogleNews(source.url, source.name)
            : await fetchRssFeed(source.url, source.name);

        // URL-level dedup across all sources. The DB unique index is
        // (source_id, external_id) which lets the same article slip in
        // twice if it arrives via two source paths. We filter BEFORE
        // insert by checking which URLs already exist anywhere.
        const urls = raw.map((s) => s.url).filter((u): u is string => Boolean(u));
        const existingUrls = new Set<string>();
        if (urls.length > 0) {
          for (let i = 0; i < urls.length; i += 200) {
            const chunk = urls.slice(i, i + 200);
            const { data: existing } = await supabase
              .from("signals")
              .select("url")
              .in("url", chunk);
            for (const row of (existing as { url: string }[] | null) ?? []) {
              if (row.url) existingUrls.add(row.url);
            }
          }
        }
        const filteredRaw = raw.filter((s) => !s.url || !existingUrls.has(s.url));
        // Some feeds (e.g. Dainik Bhaskar) emit IST timestamps labelled as
        // UTC, landing ~5.5h in the future. Any published_at more than 15 min
        // ahead of now is unreliable — fall back to ingest time so freshness
        // and clustering windows stay sane.
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const FUTURE_SLACK_MS = 15 * 60 * 1000;
        const rows = filteredRaw.map((s: RawSignal) => {
          const pubMs = new Date(s.published_at).getTime();
          const published_at =
            Number.isFinite(pubMs) && pubMs <= nowMs + FUTURE_SLACK_MS
              ? s.published_at
              : nowIso;
          return { ...s, source_id: source.id, published_at };
        });

        const { count, error: insErr } = rows.length === 0
          ? { count: 0, error: null }
          : await supabase
              .from("signals")
              .upsert(rows, {
                onConflict: "source_id,external_id",
                ignoreDuplicates: true,
                count: "exact",
              });

        await supabase
          .from("sources")
          .update({ last_sync: new Date().toISOString() })
          .eq("id", source.id);

        sourceResults.push({
          source: source.name,
          fetched: raw.length,
          inserted: count ?? 0,
          error: insErr?.message ?? null,
        });
      } catch (err) {
        sourceResults.push({
          source: source.name,
          fetched: 0,
          inserted: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: 6 }, () => worker()));

  // ── Stage 2: JSON-LD enrichment ───────────────────────────────
  // Walks freshly-inserted signals (and any older ones still missing
  // an enriched_at), fetches the article URL, and pulls description /
  // keywords / publisher_section out of the page's <script type=
  // "application/ld+json"> blocks. Best-effort — failed URLs are
  // marked enrich_failed=true so they don't retry forever.
  let enrichment: EnrichStats | { error: string } | null = null;
  if (pipeline.enrich) {
    try {
      enrichment = await enrichPendingSignals(supabase);
    } catch (err) {
      enrichment = { error: err instanceof Error ? err.message : String(err) };
      console.warn("[ingest] enrichment failed:", enrichment.error);
    }
  }

  // ── Stage 3: clustering / trend creation (no AI) ──────────────
  // Gated by the single `cluster` toggle. clusterAndTrend reads the same
  // flag internally, so we just skip the call when it's off.
  let clustering: ClusterStats | { error: string } | null = null;
  if (pipeline.cluster) {
    try {
      clustering = await clusterAndTrend(supabase, pipeline);
    } catch (err) {
      clustering = {
        error: err instanceof Error ? err.message : String(err),
      };
      console.warn("[ingest] clustering failed:", clustering.error);
    }
  }

  const duration_ms = Date.now() - started;
  const sources_failed = sourceResults.filter((s) => s.error).length;
  const signals_inserted = sourceResults.reduce(
    (a, s) => a + (s.inserted ?? 0),
    0
  );
  const trends_created =
    clustering && "trends_created" in clustering ? clustering.trends_created : 0;

  if (runId) {
    try {
      await supabase
        .from("ingest_runs")
        .update({
          status: "success",
          completed_at: new Date().toISOString(),
          sources_fetched: sourceResults.length,
          sources_failed,
          signals_inserted,
          trends_created,
          duration_ms,
        })
        .eq("id", runId);
    } catch {
      // ignore
    }
  }

  return {
    sources: sourceResults,
    enrichment,
    clustering,
    pipeline,
    duration_ms,
  };
}
