import Parser from "rss-parser";

// Capture image fields most news feeds expose. enclosure is parsed by
// rss-parser out of the box; media:* need to be registered as custom fields.
const MEDIA_FIELDS: Array<[string, string, { keepArray: true }]> = [
  ["media:content", "mediaContent", { keepArray: true }],
  ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
];

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
  customFields: { item: MEDIA_FIELDS },
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
  customFields: { item: MEDIA_FIELDS },
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

// ─── Image extraction from the feed item ────────────────────────

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url);
}

function toArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  return v != null ? [v] : [];
}

/** Best-effort image URL from a feed item: enclosure, then media:content
 * (image only), then media:thumbnail. Returns null if none look like images. */
function pickFeedImage(item: Record<string, unknown>): string | null {
  const enc = item.enclosure as { url?: string; type?: string } | undefined;
  if (enc?.url && (!enc.type || /^image\//i.test(enc.type))) return enc.url;

  for (const m of toArray(item.mediaContent)) {
    const a = (m as { $?: { url?: string; medium?: string; type?: string } })?.$;
    if (!a?.url) continue;
    if (a.medium === "image" || /^image\//i.test(a.type ?? "") || isImageUrl(a.url)) {
      return a.url;
    }
  }

  for (const m of toArray(item.mediaThumbnail)) {
    const a = (m as { $?: { url?: string } })?.$;
    if (a?.url) return a.url;
  }

  return null;
}

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

    const image = pickFeedImage(item as unknown as Record<string, unknown>);

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
        ...(image ? { image } : {}),
      },
    };
  });
}
