import { XMLParser } from "fast-xml-parser";

import type { RawSignal } from "./rss";

/**
 * Google News topic RSS fetcher.
 *
 * Each item carries a <source url="…"> attribute with the publisher's
 * canonical URL. That URL is what we use as `external_id` — NOT the
 * wrapped news.google.com link from <link>. Two reasons:
 *
 *   1. Dedup. A TOI article appearing in both TOI's sitemap-news AND
 *      Google News BUSINESS will hit the same external_id, so the unique
 *      index (source_id, external_id) naturally prevents double-counting
 *      within a source. (Cross-source dup is fine — it becomes evidence
 *      for clustering.)
 *
 *   2. Permanence. The Google News wrapped URL is opaque + redirects;
 *      the publisher URL is what reporters/editors actually click.
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

    // <source url=""> attribute → canonical publisher URL
    let publisherUrl = "";
    let publisherName = "";
    const src = item.source;
    if (src && typeof src === "object") {
      publisherUrl = s(src["@_url"]);
      publisherName = s(src["#text"]);
    }
    // If no <source url>, fall back to <link> (wrapped Google URL) — uglier
    // but better than dropping. Most items have <source url>.
    const articleUrl = publisherUrl || s(item.link);
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
