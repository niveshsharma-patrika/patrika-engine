import type { FetchedTrendItem } from "./trend-types";

/**
 * Reddit trending fetcher — public JSON API, free, no auth.
 *
 * `https://www.reddit.com/r/<sub>/hot.json` (and top.json?t=day) returns the
 * subreddit's currently-rising posts with score + comment counts, which IS a
 * trending signal. A descriptive User-Agent is required or Reddit 429s.
 *
 * Never throws: returns [] on any failure so one bad subreddit can't stop a
 * crawl. Filters out stickied/mod posts and NSFW.
 */
const UA = "web:patrika-kairos-social-trends:v1 (by /u/patrika)";
const LIMIT = 25;

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
  const url =
    sort === "top"
      ? `https://www.reddit.com/r/${sub}/top.json?t=day&limit=${LIMIT}`
      : `https://www.reddit.com/r/${sub}/hot.json?limit=${LIMIT}`;

  let json: RedditListing;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    json = (await res.json()) as RedditListing;
  } catch {
    return [];
  }

  const out: FetchedTrendItem[] = [];
  for (const c of json.data?.children ?? []) {
    const d = c.data;
    if (!d?.id || !d.title) continue;
    if (d.stickied || d.over_18) continue;

    out.push({
      externalId: `reddit_${d.id}`,
      title: d.title,
      body: (d.selftext ?? "").slice(0, 2000),
      // For link posts, url is the external article; for self posts it's the thread.
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
