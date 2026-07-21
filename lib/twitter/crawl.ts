import { pool } from "@/lib/db";
import { getSecret, X_AUTH_TOKEN } from "./secrets";

/**
 * Twitter/X crawl loop — Phase 1 (capture only, no drafting yet).
 *
 * ISOLATION: this runs on its OWN cron and writes ONLY to twitter_accounts /
 * tweets / twitter_crawls. It never touches `signals`, `sources`, `trends` or
 * `drafts`, so it cannot affect the newsroom pipeline in any way. If this whole
 * module throws, news ingest is unaffected — they share no code path.
 *
 * Tiered cadence keeps us under X's scraping limits (Scweet's own guidance is a
 * few thousand tweets/day per account). Crawling every account every 5 minutes
 * is the fastest route to a suspended scraping account.
 */

const SHIM_URL = process.env.TWITTER_SHIM_URL ?? "http://127.0.0.1:8791";

/** Minutes between crawls, by account tier. */
const TIER_INTERVAL_MIN: Record<number, number> = { 1: 5, 2: 30, 3: 120 };

const CONCURRENCY = 3;          // polite: never hammer X in parallel
const PER_ACCOUNT_TIMEOUT_MS = 45_000;
const MAX_ACCOUNTS_PER_RUN = 40; // one slow run can't run forever
const FETCH_LIMIT = 20;          // tweets requested per account

export type CrawlStats = {
  accounts_due: number;
  accounts_ok: number;
  accounts_failed: number;
  tweets_inserted: number;
  duration_ms: number;
  skipped_reason?: string;
  accounts: Array<{ handle: string; inserted: number; error: string | null }>;
};

type AccountRow = {
  id: string;
  handle: string;
  tier: number;
  last_tweet_id: string | null;
};

type ShimTweet = {
  id: string;
  author: string;
  text: string;
  url: string;
  posted_at: string;
  is_retweet: boolean;
  is_reply: boolean;
  metrics: Record<string, number>;
  media: string[];
};

/**
 * Decide what to do with a tweet.
 *
 * NOTE: this is NOT a newsworthiness judgement — the desk's curated account
 * list is the editorial filter, and every real tweet becomes a story. We only
 * separate out posts there is literally nothing to write from, because forcing
 * an article out of "शुभकामनाएं" is precisely what makes the model fabricate.
 * These are still stored and shown in the feed, never silently dropped.
 */
export function classifyTweet(t: ShimTweet): { status: string; reason: string | null } {
  if (t.is_retweet) {
    return { status: "skipped_retweet", reason: "Retweet — not the account's own words" };
  }

  // Strip URLs, @mentions and hashtags to see how much actual prose is left.
  const prose = t.text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#]\w+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Emoji/punctuation-only once prose is stripped.
  const hasLetters = /\p{L}/u.test(prose);

  if (!hasLetters || prose.length < 25) {
    return {
      status: "nothing_to_write",
      reason: prose.length === 0
        ? "No text — media or link only"
        : `Too short to research (${prose.length} chars)`,
    };
  }

  return { status: "new", reason: null };
}

/**
 * Accounts whose tier interval has elapsed since last_crawled_at.
 *
 * Tier intervals are inlined as literals (they come from TIER_INTERVAL_MIN, not
 * user input) so the whole due-check happens in one indexed scan.
 */
async function selectDueAccounts(): Promise<AccountRow[]> {
  const { rows } = await pool.query<AccountRow>(
    `SELECT id, handle, tier, last_tweet_id
       FROM twitter_accounts
      WHERE is_active = true
        AND (
          last_crawled_at IS NULL
          OR last_crawled_at < now() - make_interval(mins =>
               CASE tier
                 WHEN 1 THEN ${TIER_INTERVAL_MIN[1]}
                 WHEN 2 THEN ${TIER_INTERVAL_MIN[2]}
                 ELSE ${TIER_INTERVAL_MIN[3]}
               END)
        )
      ORDER BY tier ASC, last_crawled_at ASC NULLS FIRST
      LIMIT $1`,
    [MAX_ACCOUNTS_PER_RUN]
  );
  return rows;
}

async function fetchTimeline(
  handle: string,
  sinceId: string | null,
  cookie: string
): Promise<ShimTweet[]> {
  const url = new URL("/timeline", SHIM_URL);
  url.searchParams.set("handle", handle);
  url.searchParams.set("limit", String(FETCH_LIMIT));
  if (sinceId) url.searchParams.set("since_id", sinceId);

  const res = await fetch(url, {
    headers: { "X-Auth-Token": cookie },
    signal: AbortSignal.timeout(PER_ACCOUNT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`shim ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { tweets?: ShimTweet[] };
  return Array.isArray(json.tweets) ? json.tweets : [];
}

async function crawlAccount(acct: AccountRow, cookie: string): Promise<number> {
  const tweets = await fetchTimeline(acct.handle, acct.last_tweet_id, cookie);
  if (tweets.length === 0) return 0;

  let inserted = 0;
  let newestId: string | null = null;
  let newestMs = -1;

  for (const t of tweets) {
    const postedMs = new Date(t.posted_at).getTime();
    if (!Number.isFinite(postedMs)) continue;
    if (postedMs > newestMs) {
      newestMs = postedMs;
      newestId = t.id;
    }

    const { status, reason } = classifyTweet(t);

    // ON CONFLICT DO NOTHING makes re-crawling free — the unique index on
    // (account_id, tweet_id) is the real dedup guarantee, not since_id.
    const { rowCount } = await pool.query(
      `INSERT INTO tweets (account_id, tweet_id, author_handle, content, url,
                           posted_at, is_retweet, is_reply, metrics, media,
                           status, status_reason)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)
       ON CONFLICT (account_id, tweet_id) DO NOTHING`,
      [
        acct.id,
        t.id,
        (t.author || acct.handle).replace(/^@/, ""),
        t.text ?? "",
        t.url ?? null,
        new Date(postedMs).toISOString(),
        !!t.is_retweet,
        !!t.is_reply,
        JSON.stringify(t.metrics ?? {}),
        JSON.stringify(t.media ?? []),
        status,
        reason,
      ]
    );
    inserted += rowCount ?? 0;
  }

  await pool.query(
    `UPDATE twitter_accounts
        SET last_crawled_at = now(),
            last_tweet_id = COALESCE($2, last_tweet_id),
            consecutive_errors = 0,
            last_error = NULL,
            tweets_total = tweets_total + $3
      WHERE id = $1`,
    [acct.id, newestId, inserted]
  );

  return inserted;
}

export async function runTwitterCrawl(
  trigger: "cron" | "manual" = "cron"
): Promise<CrawlStats> {
  const started = Date.now();
  const stats: CrawlStats = {
    accounts_due: 0, accounts_ok: 0, accounts_failed: 0,
    tweets_inserted: 0, duration_ms: 0, accounts: [],
  };

  const cookie = await getSecret(X_AUTH_TOKEN);
  if (!cookie) {
    stats.duration_ms = Date.now() - started;
    stats.skipped_reason = "No X auth token configured (Twitter → Settings).";
    return stats;
  }

  const due = await selectDueAccounts();
  stats.accounts_due = due.length;
  if (due.length === 0) {
    stats.duration_ms = Date.now() - started;
    return stats;
  }

  let runId: string | null = null;
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO twitter_crawls (trigger, accounts_due) VALUES ($1,$2) RETURNING id`,
      [trigger, due.length]
    );
    runId = rows[0]?.id ?? null;
  } catch {
    // run-log failure must never stop the crawl
  }

  const queue = [...due];
  async function worker() {
    while (queue.length) {
      const acct = queue.shift();
      if (!acct) continue;
      try {
        const inserted = await crawlAccount(acct, cookie!);
        stats.accounts_ok += 1;
        stats.tweets_inserted += inserted;
        stats.accounts.push({ handle: acct.handle, inserted, error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stats.accounts_failed += 1;
        stats.accounts.push({ handle: acct.handle, inserted: 0, error: message });
        // Record the failure but still stamp last_crawled_at, otherwise a
        // permanently broken handle would be retried on every single tick.
        await pool
          .query(
            `UPDATE twitter_accounts
                SET last_crawled_at = now(),
                    consecutive_errors = consecutive_errors + 1,
                    last_error = $2
              WHERE id = $1`,
            [acct.id, message.slice(0, 500)]
          )
          .catch(() => {});
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  stats.duration_ms = Date.now() - started;

  if (runId) {
    await pool
      .query(
        `UPDATE twitter_crawls
            SET completed_at = now(), accounts_ok = $2, accounts_failed = $3,
                tweets_inserted = $4, duration_ms = $5
          WHERE id = $1`,
        [runId, stats.accounts_ok, stats.accounts_failed, stats.tweets_inserted, stats.duration_ms]
      )
      .catch(() => {});
  }

  return stats;
}
