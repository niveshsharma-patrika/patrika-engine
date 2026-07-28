import { getSecret } from "@/lib/twitter/secrets";
import { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET } from "./types";
import type { FetchedTrendItem } from "./trend-types";

/**
 * Reddit trending fetcher — OAuth (application-only).
 *
 * Reddit blocks unauthenticated requests from datacenter IPs (it serves an HTML
 * page instead of JSON), so a server MUST authenticate. We use the
 * client-credentials grant on a free "script" app — only a client id + secret,
 * no username/password. Authenticated requests to oauth.reddit.com get a proper
 * quota and real JSON.
 *
 * Unlike before, this THROWS on real failures (no creds, auth rejected, HTTP
 * error) so the crawl records the reason in the source's last_error instead of
 * silently showing "no trends".
 */
const UA = "web:patrika-kairos-social-trends:v1 (by /u/patrika_kairos)";
const LIMIT = 25;

// App-only token, cached for the process (Reddit tokens last ~1h).
let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.exp - 60_000) return cachedToken.token;

  const id = await getSecret(REDDIT_CLIENT_ID);
  const secret = await getSecret(REDDIT_CLIENT_SECRET);
  if (!id || !secret) {
    throw new Error(
      "Reddit API credentials not set. Add them in Admin → Integration keys " +
      "(Reddit blocks server IPs without OAuth)."
    );
  }

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => "");
    throw new Error(`Reddit auth ${res.status}: ${b.slice(0, 150)}`);
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Reddit auth returned no token (check the client id/secret).");

  cachedToken = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

type RedditChild = {
  data?: {
    id?: string;
    title?: string;
    selftext?: string;
    url?: string;
    permalink?: string;
    author?: string;
    subreddit?: string;
    score?: number;
    num_comments?: number;
    created_utc?: number;
    stickied?: boolean;
    over_18?: boolean;
    is_self?: boolean;
    thumbnail?: string;
    preview?: { images?: Array<{ source?: { url?: string } }> };
  };
};
type RedditListing = { data?: { children?: RedditChild[] } };

function bestThumb(d: NonNullable<RedditChild["data"]>): string | null {
  const prev = d.preview?.images?.[0]?.source?.url;
  if (prev) return prev.replace(/&amp;/g, "&");
  if (d.thumbnail && /^https?:\/\//.test(d.thumbnail)) return d.thumbnail;
  return null;
}

export async function fetchRedditTrends(
  subreddit: string,
  sort: "hot" | "top" = "hot"
): Promise<FetchedTrendItem[]> {
  const sub = subreddit.replace(/^\/?r\//i, "").replace(/[^\w]/g, "");
  if (!sub) return [];

  const token = await getToken(); // throws if creds missing/invalid → recorded by the crawl

  const path =
    sort === "top"
      ? `/r/${sub}/top?t=day&limit=${LIMIT}&raw_json=1`
      : `/r/${sub}/hot?limit=${LIMIT}&raw_json=1`;

  const res = await fetch(`https://oauth.reddit.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 401) {
    cachedToken = null; // token stale — force a refresh next time
    throw new Error("Reddit token rejected (401).");
  }
  if (!res.ok) throw new Error(`Reddit ${res.status} for r/${sub}.`);

  const json = (await res.json()) as RedditListing;
  const out: FetchedTrendItem[] = [];
  for (const c of json.data?.children ?? []) {
    const d = c.data;
    if (!d?.id || !d.title) continue;
    if (d.stickied || d.over_18) continue;
    out.push({
      externalId: `reddit_${d.id}`,
      title: d.title,
      body: (d.selftext ?? "").slice(0, 2000),
      url: d.is_self ? null : d.url ?? null,
      permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : null,
      thumbnail: bestThumb(d),
      author: d.author ?? null,
      origin: d.subreddit ?? sub,
      score: d.score ?? 0,
      comments: d.num_comments ?? 0,
      postedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
    });
  }
  return out;
}
