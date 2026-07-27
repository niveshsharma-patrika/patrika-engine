import { pool } from "@/lib/db";
import { scorePost, type Platform } from "./score";
import { fetchYouTube } from "./youtube";
import { fetchX } from "./x";
import { fetchInstagram } from "./instagram";
import type { FetchedAccount } from "./types";

/**
 * Social sync — pull each tracked account's recent posts, score them, store.
 *
 * ISOLATION: reads/writes only social_* tables. Cannot touch the news or
 * Twitter-drafting pipelines.
 *
 * Facebook has no free competitor-analytics API, so those accounts are skipped
 * with an explanatory note rather than silently doing nothing.
 */

const CONCURRENCY = 2; // gentle — YouTube quota + X rate limits

type AccountRow = {
  id: string;
  platform: Platform;
  handle: string;
  followers: number | null;
};

export type SyncStats = {
  accounts: number;
  accounts_ok: number;
  accounts_failed: number;
  posts_upserted: number;
  duration_ms: number;
  results: Array<{ platform: string; handle: string; posts: number; error: string | null }>;
};

function fetcherFor(platform: Platform): ((h: string) => Promise<FetchedAccount>) | null {
  switch (platform) {
    case "youtube": return fetchYouTube;
    case "x": return fetchX;
    case "instagram": return fetchInstagram;
    case "facebook": return null; // no free competitor API
  }
}

async function syncAccount(acct: AccountRow): Promise<number> {
  const fetcher = fetcherFor(acct.platform);
  if (!fetcher) {
    throw new Error("Facebook competitor analytics aren't available for free — add posts manually.");
  }

  const data = await fetcher(acct.handle);
  const followers = data.followers ?? acct.followers ?? null;

  let upserted = 0;
  for (const p of data.posts) {
    const s = scorePost(acct.platform, p, followers);
    const { rowCount } = await pool.query(
      `INSERT INTO social_posts (account_id, platform, post_id, url, content, media_url,
            posted_at, likes, comments, shares, views, engagement, engagement_rate,
            virality_score, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
       ON CONFLICT (account_id, post_id) DO UPDATE
         SET likes=EXCLUDED.likes, comments=EXCLUDED.comments, shares=EXCLUDED.shares,
             views=EXCLUDED.views, engagement=EXCLUDED.engagement,
             engagement_rate=EXCLUDED.engagement_rate, virality_score=EXCLUDED.virality_score,
             fetched_at=now()`,
      [
        acct.id, acct.platform, p.postId, p.url, p.content.slice(0, 4000), p.mediaUrl,
        p.postedAt, p.likes, p.comments, p.shares, p.views,
        s.engagement, s.engagementRate, s.viralityScore,
      ]
    );
    upserted += rowCount ?? 0;
  }

  await pool.query(
    `UPDATE social_accounts
        SET followers = COALESCE($2, followers),
            external_id = COALESCE($3, external_id),
            display_name = COALESCE(display_name, $4),
            last_synced_at = now(), last_error = NULL
      WHERE id = $1`,
    [acct.id, followers, data.externalId, data.displayName]
  );

  return upserted;
}

export async function runSocialSync(
  trigger: "cron" | "manual" = "cron",
  onlyId?: string
): Promise<SyncStats> {
  const started = Date.now();
  const stats: SyncStats = {
    accounts: 0, accounts_ok: 0, accounts_failed: 0,
    posts_upserted: 0, duration_ms: 0, results: [],
  };

  const { rows } = await pool.query<AccountRow>(
    `SELECT id, platform, handle, followers
       FROM social_accounts
      WHERE is_active = true ${onlyId ? "AND id = $1" : ""}
      ORDER BY last_synced_at ASC NULLS FIRST`,
    onlyId ? [onlyId] : []
  );
  stats.accounts = rows.length;
  if (rows.length === 0) {
    stats.duration_ms = Date.now() - started;
    return stats;
  }

  let runId: string | null = null;
  try {
    const { rows: r } = await pool.query<{ id: string }>(
      `INSERT INTO social_syncs (trigger) VALUES ($1) RETURNING id`, [trigger]
    );
    runId = r[0]?.id ?? null;
  } catch { /* run log best-effort */ }

  const queue = [...rows];
  async function worker() {
    while (queue.length) {
      const acct = queue.shift();
      if (!acct) continue;
      try {
        const n = await syncAccount(acct);
        stats.accounts_ok += 1;
        stats.posts_upserted += n;
        stats.results.push({ platform: acct.platform, handle: acct.handle, posts: n, error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stats.accounts_failed += 1;
        stats.results.push({ platform: acct.platform, handle: acct.handle, posts: 0, error: message });
        await pool.query(
          `UPDATE social_accounts SET last_synced_at = now(), last_error = $2 WHERE id = $1`,
          [acct.id, message.slice(0, 500)]
        ).catch(() => {});
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  stats.duration_ms = Date.now() - started;
  if (runId) {
    await pool.query(
      `UPDATE social_syncs SET completed_at=now(), accounts_ok=$2, accounts_failed=$3,
              posts_upserted=$4, duration_ms=$5 WHERE id=$1`,
      [runId, stats.accounts_ok, stats.accounts_failed, stats.posts_upserted, stats.duration_ms]
    ).catch(() => {});
  }

  return stats;
}
