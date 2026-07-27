import { getSecret, X_AUTH_TOKEN } from "@/lib/twitter/secrets";
import type { FetchedAccount, FetchedPost } from "./types";

/**
 * X (Twitter) fetcher — reuses the Scweet shim we already run for the Twitter
 * feature (same cookie, same 127.0.0.1 service). No new dependency.
 *
 * The shim's tweet objects carry per-post view counts, so virality scoring uses
 * views as reach and does NOT need the account's follower count — which the
 * timeline endpoint doesn't return. followers stays null (shown as "—").
 */
const SHIM_URL = process.env.TWITTER_SHIM_URL ?? "http://127.0.0.1:8791";
const LIMIT = 20;

type ShimTweet = {
  id: string;
  author: string;
  text: string;
  url: string;
  posted_at: string;
  is_retweet: boolean;
  metrics: { likes?: number; retweets?: number; replies?: number; views?: number };
  media: string[];
};

export async function fetchX(handle: string): Promise<FetchedAccount> {
  const cookie = await getSecret(X_AUTH_TOKEN);
  if (!cookie) throw new Error("No X auth token set (Twitter → Settings).");

  const clean = handle.replace(/^@/, "").replace(/.*x\.com\//i, "").split(/[/?#]/)[0];
  const url = new URL("/timeline", SHIM_URL);
  url.searchParams.set("handle", clean);
  url.searchParams.set("limit", String(LIMIT));

  const res = await fetch(url, {
    headers: { "X-Auth-Token": cookie },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`X shim ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { tweets?: ShimTweet[] };
  const tweets = Array.isArray(json.tweets) ? json.tweets : [];

  const posts: FetchedPost[] = tweets
    .filter((t) => !t.is_retweet)
    .map((t) => ({
      postId: t.id,
      url: t.url,
      content: t.text ?? "",
      mediaUrl: t.media?.[0] ?? null,
      postedAt: t.posted_at,
      likes: t.metrics?.likes ?? 0,
      comments: t.metrics?.replies ?? 0,
      shares: t.metrics?.retweets ?? 0,
      views: t.metrics?.views ?? 0,
    }));

  return { externalId: clean, displayName: `@${clean}`, followers: null, posts };
}
