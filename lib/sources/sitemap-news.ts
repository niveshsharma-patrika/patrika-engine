import { XMLParser } from "fast-xml-parser";

import type { RawSignal } from "./rss";

/**
 * Publisher sitemap-news.xml fetcher.
 *
 * Format (per https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap):
 *
 *   <urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
 *     <url>
 *       <loc>https://publisher.com/article/path</loc>
 *       <news:news>
 *         <news:publication>
 *           <news:name>Publisher Name</news:name>
 *         </news:publication>
 *         <news:publication_date>2026-05-19T10:30:00+05:30</news:publication_date>
 *         <news:title>Article title</news:title>
 *       </news:news>
 *     </url>
 *     ...
 *   </urlset>
 *
 * Each <url> in the file becomes one RawSignal with the same shape RSS
 * produces, so the rest of the ingest pipeline doesn't need to care.
 */

// Minimal UA — counterintuitively works better than a "full Chrome" header
// bundle. Several Indian publishers (The Print, parts of NDTV) WAF-block
// the sophisticated Chrome UA but accept the simpler form. The full
// Sec-Ch-Ua header bundle is what trips their bot detection most often.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/xml,text/xml,application/rss+xml,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
};

/** Some publishers (India Today, Aaj Tak) wrap CDATA content with surrounding
 * whitespace. fast-xml-parser's trimValues:true doesn't reach inside CDATA,
 * so `new Date(" 2026-05-20T...")` fails. This trims defensively. */
function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // The 'news:' prefix in element names is mapped onto the parsed object
  // as a property — preserve it so we can read news:title etc.
  removeNSPrefix: false,
  // Some publishers stick CDATA-wrapped titles or odd whitespace in <news:title>.
  trimValues: true,
  // Single-item <url>/<sitemap> sometimes parses as object, not array — coerce.
  isArray: (name: string) => name === "url" || name === "sitemap",
});

// Sitemap-index recursion: cap how many child sitemaps we follow per parent.
// Most publishers split today's articles across 2-4 child files; 4 covers
// the common cases (TOI splits into 2, Bhaskar into ~20, Newslaundry uses
// daily-rotating files). Cap protects against pathological cases.
const MAX_CHILD_SITEMAPS = 4;

/**
 * Start of "today" in IST (Asia/Kolkata) as a UTC Date.
 * Sitemap-news files contain the last 48 hours — we hard-stop ingestion
 * at midnight IST so the dashboard only shows today's articles.
 *
 * Optional env override INGEST_SINCE_ISO: when set to a parseable ISO
 * timestamp NEWER than today's IST midnight, that timestamp is used as
 * the cutoff instead. Designed for one-shot resets where you want only
 * the second half of the day (e.g., "from 12 noon today"). At the next
 * midnight IST rollover the env value becomes stale (older than the new
 * day's midnight) and the function naturally reverts to normal behavior.
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

type ParsedUrl = {
  loc?: string;
  lastmod?: string;
  "news:news"?: {
    "news:publication"?: { "news:name"?: string; "news:language"?: string };
    "news:publication_date"?: string;
    "news:title"?: string;
    "news:keywords"?: string;
  };
};

type ParsedSitemap = {
  loc?: string;
  lastmod?: string;
};

/**
 * Fetch raw XML text from a sitemap URL.
 */
async function fetchXml(url: string, sourceName: string): Promise<string> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Sitemap fetch failed for ${sourceName} @ ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

/**
 * Fetch and parse a publisher sitemap-news.xml. Handles three cases:
 *
 *   1. Flat <urlset> with <url><news:news> entries — parse directly
 *   2. <sitemapindex> pointing to child sitemaps — recurse, fetch up to
 *      MAX_CHILD_SITEMAPS children sorted by lastmod desc (newest first),
 *      aggregate articles from all of them
 *   3. Anything else — throws
 *
 * The index case covers TOI (today's index → 2 child files), Bhaskar
 * (20+ child files), Newslaundry (daily-rotating files), and similar.
 */
export async function fetchSitemapNews(
  url: string,
  sourceName: string
): Promise<RawSignal[]> {
  let xml: string;
  try {
    xml = await fetchXml(url, sourceName);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : String(err)
    );
  }

  let parsed: {
    urlset?: { url?: ParsedUrl[] };
    sitemapindex?: { sitemap?: ParsedSitemap[] };
  };
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    throw new Error(
      `Sitemap parse failed for ${sourceName}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Case 2: sitemap-index — recurse into child sitemaps and aggregate.
  if (parsed.sitemapindex && !parsed.urlset) {
    const children = parsed.sitemapindex.sitemap ?? [];
    // Sort by lastmod desc so we hit today's content first; cap to N.
    const sorted = [...children]
      .filter((c) => c.loc)
      .sort((a, b) => {
        const ta = a.lastmod ? new Date(a.lastmod).getTime() : 0;
        const tb = b.lastmod ? new Date(b.lastmod).getTime() : 0;
        return tb - ta;
      })
      .slice(0, MAX_CHILD_SITEMAPS);

    const all: RawSignal[] = [];
    for (const child of sorted) {
      if (!child.loc) continue;
      try {
        const childSignals = await fetchSitemapNews(child.loc, sourceName);
        all.push(...childSignals);
      } catch (err) {
        // One child failure doesn't break the whole fetch
        console.warn(
          `[sitemap-news] child ${child.loc} failed for ${sourceName}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return all;
  }

  // Case 1: flat urlset
  const urls = parsed.urlset?.url ?? [];
  const signals: RawSignal[] = [];

  // Hard stop: only articles published today (IST). Everything earlier
  // is dropped silently — they're in the sitemap but not in scope.
  const todayStartMs = todayIstStartUtc().getTime();

  for (const entry of urls) {
    const loc = s(entry.loc);
    if (!loc) continue;

    const news = entry["news:news"];
    const title = s(news?.["news:title"]);
    if (!title) continue; // Some sitemap entries are non-news (web stories, etc.)

    const publishedRaw = s(news?.["news:publication_date"]);
    const lastmodRaw = s(entry.lastmod);
    let publishedDate: Date;
    if (publishedRaw) {
      publishedDate = new Date(publishedRaw);
      if (isNaN(publishedDate.getTime())) publishedDate = new Date();
    } else if (lastmodRaw) {
      publishedDate = new Date(lastmodRaw);
      if (isNaN(publishedDate.getTime())) publishedDate = new Date();
    } else {
      publishedDate = new Date();
    }

    // Drop anything from before today IST midnight.
    if (publishedDate.getTime() < todayStartMs) continue;

    const published_at = publishedDate.toISOString();

    const publisher = s(news?.["news:publication"]?.["news:name"]) || sourceName;
    const keywords = s(news?.["news:keywords"]);

    // Content = title + (truncated keywords as a proxy for summary).
    // Sitemap-news doesn't include article body, but title alone has been
    // enough for our token-overlap clustering to work.
    const content = keywords
      ? `${title} — ${keywords.slice(0, 200)}`
      : title;

    signals.push({
      external_id: loc.slice(0, 500), // URL is the most reliable dedup key
      author: publisher,
      content,
      url: loc,
      published_at,
      metadata: {
        title,
        keywords,
        source: "sitemap_news",
      },
    });
  }

  return signals;
}
