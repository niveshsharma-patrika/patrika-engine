import { XMLParser } from "fast-xml-parser";

import type { RawSignal } from "./rss";

/**
 * Google News topic/search RSS fetcher.
 *
 * Each item carries:
 *   • <title>   "Headline - Publisher Name"
 *   • <link>    a unique news.google.com/rss/articles/… URL that redirects
 *               to the publisher's article — used as external_id + url.
 *   • <source url="https://publisher.com">Publisher Name</source>
 *               the url is only the publisher's DOMAIN, so we take just the
 *               NAME (it drives the distinct-publisher / 3-source count).
 *
 * The same article may also arrive via a publisher's own feed under a
 * different URL — that's fine: clustering groups them and the publisher
 * name canonicalises to one outlet, so the 3-source rule stays honest.
 *
 * Filter: same today-IST cutoff as sitemap-news. Google sometimes returns
 * 24-48h of items; we drop anything pre-midnight IST.
 */

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "en-IN,en;q=0.9",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  isArray: (name) => name === "item",
});

type GNItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  source?: { "@_url"?: string; "#text"?: string } | string;
};

type GNRss = {
  rss?: { channel?: { item?: GNItem[] } };
};

/**
 * "YYYY-MM-DD" in IST → Date at IST midnight, returned as UTC.
 * Honours INGEST_SINCE_ISO env override when it's newer than today's
 * midnight (used for one-shot resets that want a tighter cutoff).
 */
function todayIstStartUtc(): Date {
  const istDate = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const midnight = new Date(`${istDate}T00:00:00+05:30`);
  const envSince = process.env.INGEST_SINCE_ISO;
  if (envSince) {
    const sinceDate = new Date(envSince);
    if (!isNaN(sinceDate.getTime()) && sinceDate.getTime() > midnight.getTime()) {
      return sinceDate;
    }
  }
  return midnight;
}

/** Defensive string trim — fast-xml-parser leaves CDATA whitespace intact. */
function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Fetch a Google News topic RSS feed and return one RawSignal per item
 * whose `<source url>` is set and `<pubDate>` is from today (IST).
 *
 * Throws on network failure so the ingest worker can mark the source
 * as errored, same pattern as fetchRssFeed and fetchSitemapNews.
 */
export async function fetchGoogleNews(
  url: string,
  sourceName: string
): Promise<RawSignal[]> {
  let xml: string;
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (err) {
    throw new Error(
      `Google News fetch failed for ${sourceName}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: GNRss;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    throw new Error(
      `Google News parse failed for ${sourceName}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const items = parsed.rss?.channel?.item ?? [];
  const out: RawSignal[] = [];
  const todayStartMs = todayIstStartUtc().getTime();

  for (const item of items) {
    const titleRaw = s(item.title);
    if (!titleRaw) continue;

    // <source> gives the real publisher NAME — essential for the 3-source
    // count. Its url attribute is only the publisher's domain (e.g.
    // https://www.reuters.com), so it is NOT a per-article identifier.
    let publisherName = "";
    const src = item.source;
    if (src && typeof src === "object") publisherName = s(src["#text"]);
    else if (typeof src === "string") publisherName = s(src);

    // <link> is Google's per-article URL (unique; redirects to the
    // publisher's article). Use it as both external_id and url.
    const articleUrl = s(item.link);
    if (!articleUrl) continue;

    // Parse pubDate (RFC 822 format like "Wed, 20 May 2026 09:41:26 GMT")
    let publishedDate = new Date(s(item.pubDate));
    if (isNaN(publishedDate.getTime())) publishedDate = new Date();
    if (publishedDate.getTime() < todayStartMs) continue;

    // The title in Google News RSS is usually "Headline - Publisher Name".
    // Strip the trailing " - Publisher" suffix so clustering tokens match
    // headlines from the publisher's own sitemap-news entries.
    const cleanTitle = publisherName
      ? titleRaw.replace(new RegExp(`\\s*-\\s*${escapeRegex(publisherName)}\\s*$`), "").trim() || titleRaw
      : titleRaw;

    out.push({
      external_id: articleUrl.slice(0, 500), // unique index limit
      author: publisherName || sourceName,
      content: cleanTitle,
      url: articleUrl,
      published_at: publishedDate.toISOString(),
      metadata: {
        title: cleanTitle,
        publisher: publisherName,
        via: "google_news_topic",
        topic_feed: sourceName,
      },
    });
  }

  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type TopicHit = { source: string; title: string; url: string; publishedAt: string };

/**
 * On-demand topic search against Google News RSS — used by "Write on a topic"
 * to ground an article in CURRENT reporting instead of the model's stale memory.
 * Returns the most recent, de-duplicated hits (last ~10 days). Never throws:
 * on any failure it returns [] so the caller falls back to a knowledge-only draft.
 */
export async function searchGoogleNews(
  query: string,
  lang: "en" | "hi",
  limit = 10
): Promise<TopicHit[]> {
  const q = query.trim().slice(0, 250);
  if (!q) return [];
  const hl = lang === "hi" ? "hi-IN" : "en-IN";
  const ceid = lang === "hi" ? "IN:hi" : "IN:en";
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=IN&ceid=${ceid}`;

  let xml: string;
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  let parsed: GNRss;
  try {
    parsed = parser.parse(xml);
  } catch {
    return [];
  }

  const items = parsed.rss?.channel?.item ?? [];
  const cutoff = Date.now() - 10 * 86_400_000; // last ~10 days
  const hits: TopicHit[] = [];
  for (const item of items) {
    const titleRaw = s(item.title);
    const link = s(item.link);
    if (!titleRaw || !link) continue;

    let publisher = "";
    const src = item.source;
    if (src && typeof src === "object") publisher = s(src["#text"]);
    else if (typeof src === "string") publisher = s(src);

    let pub = new Date(s(item.pubDate));
    if (isNaN(pub.getTime())) pub = new Date();
    if (pub.getTime() < cutoff) continue;

    const title = publisher
      ? titleRaw.replace(new RegExp(`\\s*-\\s*${escapeRegex(publisher)}\\s*$`), "").trim() || titleRaw
      : titleRaw;
    hits.push({ source: publisher || "News", title, url: link, publishedAt: pub.toISOString() });
  }

  hits.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const seen = new Set<string>();
  return hits
    .filter((h) => {
      const k = h.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}
