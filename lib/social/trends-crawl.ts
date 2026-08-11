import { pool } from "@/lib/db";
import { fetchRedditTrends } from "./reddit";
import { fetchXTrends } from "./x-trends";
import { fetchInstagramTrends } from "./instagram";
import type { FetchedTrendItem } from "./trend-types";

/**
 * Social Trends crawl — pull trending items from every active source and store
 * them. Mirrors the news ingest's shape but for social feeds.
 *
 * ISOLATION: reads/writes only social_trend_* tables. Never touches
 * news/Twitter/drafts.
 */
const CONCURRENCY = 3;

type SourceRow = { id: string; platform: "reddit" | "x" | "instagram"; query: string };

export type TrendsCrawlStats = {
  sources: number;
  sources_ok: number;
  sources_failed: number;
  items_upserted: number;
  duration_ms: number;
  results: Array<{ platform: string; query: string; items: number; error: string | null }>;
};

async function crawlSource(src: SourceRow): Promise<number> {
  const items: FetchedTrendItem[] =
    src.platform === "reddit"
      ? await fetchRedditTrends(src.query, "hot")
      : src.platform === "instagram"
      ? await fetchInstagramTrends(src.query)
      : await fetchXTrends(src.query);

  let upserted = 0;
  for (const it of items) {
    const { rowCount } = await pool.query(
      `INSERT INTO social_trend_items
         (source_id, platform, external_id, title, body, url, permalink, thumbnail,
          author, origin, score, comments, posted_at, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
       ON CONFLICT (platform, external_id) DO UPDATE
         SET score = EXCLUDED.score, comments = EXCLUDED.comments,
             title = EXCLUDED.title, thumbnail = EXCLUDED.thumbnail,
             fetched_at = now()`,
      [
        src.id, src.platform, it.externalId, it.title.slice(0, 500), it.body,
        it.url, it.permalink, it.thumbnail, it.author, it.origin,
        it.score, it.comments, it.postedAt,
      ]
    );
    upserted += rowCount ?? 0;
  }

  await pool.query(
    `UPDATE social_trend_sources SET last_crawled_at = now(), last_error = NULL WHERE id = $1`,
    [src.id]
  );
  return upserted;
}

export async function runTrendsCrawl(
  trigger: "cron" | "manual" = "cron"
): Promise<TrendsCrawlStats> {
  const started = Date.now();
  const stats: TrendsCrawlStats = {
    sources: 0, sources_ok: 0, sources_failed: 0,
    items_upserted: 0, duration_ms: 0, results: [],
  };

  const { rows } = await pool.query<SourceRow>(
    `SELECT id, platform, query FROM social_trend_sources
      WHERE is_active = true ORDER BY last_crawled_at ASC NULLS FIRST`
  );
  stats.sources = rows.length;
  if (rows.length === 0) {
    stats.duration_ms = Date.now() - started;
    return stats;
  }

  const queue = [...rows];
  async function worker() {
    while (queue.length) {
      const src = queue.shift();
      if (!src) continue;
      try {
        const n = await crawlSource(src);
        stats.sources_ok += 1;
        stats.items_upserted += n;
        stats.results.push({ platform: src.platform, query: src.query, items: n, error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stats.sources_failed += 1;
        stats.results.push({ platform: src.platform, query: src.query, items: 0, error: message });
        await pool.query(
          `UPDATE social_trend_sources SET last_crawled_at = now(), last_error = $2 WHERE id = $1`,
          [src.id, message.slice(0, 500)]
        ).catch(() => {});
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Prune anything older than 5 days so the trend list stays fresh.
  await pool.query(
    `DELETE FROM social_trend_items WHERE fetched_at < now() - interval '5 days'`
  ).catch(() => {});

  stats.duration_ms = Date.now() - started;
  return stats;
}
