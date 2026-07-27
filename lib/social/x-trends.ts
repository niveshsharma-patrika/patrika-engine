import { getSecret, X_AUTH_TOKEN } from "@/lib/twitter/secrets";
import type { FetchedTrendItem } from "./trend-types";

/**
 * X (Twitter) trending fetcher — high-engagement recent tweets for a keyword or
 * hashtag, via the shim's /search endpoint (Scweet Top search + a min-likes
 * floor). Reuses the same cookie as the Twitter feature.
 *
 * Never throws: returns [] on any failure so a crawl keeps going.
 */
const SHIM_URL = process.env.TWITTER_SHIM_URL ?? "http://127.0.0.1:8791";
const LIMIT = 20;
const MIN_LIKES = 100; // a tweet only "trends" if it caught on

type ShimTweet = {
  id: string;
  author: string;
  text: string;
  url: string;
  posted_at: string;
  metrics: { likes?: number; retweets?: number; replies?: number; views?: number };
  media: string[];
};

export async function fetchXTrends(keyword: string): Promise<FetchedTrendItem[]> {
  const cookie = await getSecret(X_AUTH_TOKEN);
  if (!cookie) return []; // no cookie → skip X quietly

  const q = keyword.trim();
  if (!q) return [];

  const url = new URL("/search", SHIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(LIMIT));
  url.searchParams.set("min_likes", String(MIN_LIKES));

  let tweets: ShimTweet[];
  try {
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cookie },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { tweets?: ShimTweet[] };
    tweets = Array.isArray(json.tweets) ? json.tweets : [];
  } catch {
    return [];
  }

  return tweets.map((t): FetchedTrendItem => ({
    externalId: `x_${t.id}`,
    title: (t.text ?? "").slice(0, 200),
    body: t.text ?? "",
    url: null,
    permalink: t.url,
    thumbnail: t.media?.[0] ?? null,
    author: t.author ? `@${t.author}` : null,
    origin: q,
    score: t.metrics?.likes ?? 0,
    comments: t.metrics?.replies ?? 0,
    postedAt: t.posted_at ?? null,
  }));
}
