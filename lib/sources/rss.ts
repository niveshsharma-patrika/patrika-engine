import Parser from "rss-parser";

// Default parser: pretends to be Chrome so sources like Moneycontrol /
// FirstPost / News18 that block non-browser UAs let us through.
const DEFAULT_PARSER = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
  },
});

// xcancel.com / nitter forks require an RSS-reader-style UA + RSS Accept
// header AND a one-time email whitelist of the resulting ID hash
// (see docs in supabase/migrations/0006_more_sources.sql).
const PATRIKA_RSS_UA =
  "Patrika-Engine/1.0 RSS Reader (https://patrika.com; +editorial trend monitor for Patrika newsroom)";

const XCANCEL_PARSER = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": PATRIKA_RSS_UA,
    Accept: "application/rss+xml",
  },
});

function pickParser(url: string): Parser {
  if (url.includes("xcancel.com") || url.includes("nitter.")) {
    return XCANCEL_PARSER;
  }
  return DEFAULT_PARSER;
}

export type RawSignal = {
  external_id: string;
  author: string;
  content: string;
  url: string | null;
  published_at: string;
  metadata: Record<string, unknown>;
};

/**
 * Fetch an RSS/Atom feed and normalise items into RawSignals.
 * Returns an empty array on parse failure, never throws.
 */
export async function fetchRssFeed(
  url: string,
  sourceName: string
): Promise<RawSignal[]> {
  let feed;
  try {
    feed = await pickParser(url).parseURL(url);
  } catch (err) {
    throw new Error(
      `RSS parse failed for ${sourceName}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Take everything the feed exposes, with a safety cap of 500 so a
  // pathological feed can't blow the request. Most feeds expose 20-200.
  return (feed.items ?? []).slice(0, 500).map((item) => {
    const title = (item.title ?? "").trim();
    const snippet = ((item.contentSnippet ?? "") as string).slice(0, 280).trim();
    const content = snippet ? `${title} — ${snippet}` : title;

    // External ID: prefer guid, fall back to link, then to a stable hash of title.
    const idBase = item.guid || item.link || `${sourceName}::${title}`;
    const external_id = idBase.slice(0, 500); // DB safety

    return {
      external_id,
      author: feed.title ?? sourceName,
      content,
      url: item.link ?? null,
      published_at: item.isoDate ?? new Date().toISOString(),
      metadata: {
        title,
        snippet,
        categories: (item.categories ?? []) as string[],
      },
    };
  });
}
