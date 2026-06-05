/**
 * JSON-LD enrichment: takes an article URL, GETs the HTML, and pulls
 * structured metadata out of any <script type="application/ld+json"> blocks.
 *
 * Returns the publisher's own description, keywords list, and editorial
 * section — all far richer signal for clustering / embedding / dedup
 * than the 280-char snippet we have from the RSS/sitemap.
 *
 * Robust to:
 *   - multiple JSON-LD blocks per page (publishers often have 5-10)
 *   - top-level arrays, single objects, and @graph nesting
 *   - keywords as string OR array
 *   - articleSection as string OR array
 *   - oversized HTML bodies (we truncate to MAX_BODY_BYTES)
 *   - broken JSON in one block (skip, keep parsing others)
 *
 * Returns null only when the page is unreachable, returns non-2xx, or
 * has no parseable NewsArticle/Article/BlogPosting block.
 */

export type EnrichedFields = {
  description: string | null;
  keywords: string[];
  publisher_section: string | null;
  image: string | null;
};

const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 700_000;
const UA = "Mozilla/5.0 (compatible; PatrikaEngine/1.0; Editorial trend monitor for Patrika newsroom)";

export async function enrichFromUrl(url: string): Promise<EnrichedFields | null> {
  let body: string;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const truncated =
      buf.byteLength > MAX_BODY_BYTES ? buf.slice(0, MAX_BODY_BYTES) : buf;
    body = new TextDecoder("utf-8", { fatal: false }).decode(truncated);
  } catch {
    return null;
  }
  return parseJsonLd(body);
}

export function parseJsonLd(html: string): EnrichedFields | null {
  // Pass 1 — proper JSON-LD NewsArticle/Article/BlogPosting candidates.
  const jl = pickFromJsonLd(html);

  // Pass 2 — fall back to OG / meta / Twitter card tags. Many Indian
  // publishers (The Hindu, Dainik Jagran, Aaj Tak, Amar Ujala video pages)
  // either ship no NewsArticle JSON-LD or break the JSON they do ship,
  // but their <head> meta tags are clean and editorial-quality.
  const meta = scrapeMetaTags(html);

  // Merge: prefer JSON-LD fields, fill blanks from meta.
  const description = jl?.description ?? meta.description;
  const keywords =
    (jl?.keywords && jl.keywords.length > 0 ? jl.keywords : meta.keywords) ?? [];
  const publisher_section = jl?.publisher_section ?? meta.section;
  const image = jl?.image ?? meta.image;

  // If we got nothing useful at all, surface as a failure.
  if (!description && keywords.length === 0 && !publisher_section && !image) return null;

  return {
    description: description ?? null,
    keywords,
    publisher_section: publisher_section ?? null,
    image: image ?? null,
  };
}

/** Pass 1: walk <script type="application/ld+json"> blocks and pick the
 * best NewsArticle / Article / BlogPosting / Report candidate. */
function pickFromJsonLd(html: string): EnrichedFields | null {
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const candidates: Record<string, unknown>[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        parsed = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      } catch {
        continue;
      }
    }
    for (const item of unwrap(parsed)) {
      if (item && typeof item === "object") {
        candidates.push(item as Record<string, unknown>);
      }
    }
  }

  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const t = typeStr(c);
    if (!/News|Article|Blog|Report/i.test(t)) continue;
    const desc = pickStr(c.description) ?? pickStr(c.articleBody) ?? "";
    const kw = parseKeywords(c.keywords);
    const score = desc.length + kw.length * 50;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return null;

  return {
    description:
      pickStr(best.description) ??
      pickStr(best.articleBody)?.slice(0, 600) ??
      null,
    keywords: parseKeywords(best.keywords),
    publisher_section:
      pickStr(best.articleSection) ?? pickStr(best.section) ?? null,
    image: pickImageUrl(best.image),
  };
}

/** Pass 2: scrape OG, Twitter card, and standard meta tags from <head>.
 * Only looks at the first 80KB — meta tags are always in the head. */
function scrapeMetaTags(html: string): {
  description: string | null;
  keywords: string[];
  section: string | null;
  image: string | null;
} {
  const head = html.slice(0, 80_000);

  function metaContent(re: RegExp): string | null {
    const mm = head.match(re);
    return mm ? decodeEntities(mm[1].trim()) : null;
  }

  const image =
    metaContent(
      /<meta\s+(?:property|name)=["']og:image(?::secure_url|:url)?["']\s+content=["']([^"']+)["']/i
    ) ??
    metaContent(
      /<meta\s+(?:name|property)=["']twitter:image(?::src)?["']\s+content=["']([^"']+)["']/i
    );

  const description =
    metaContent(
      /<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/i
    ) ??
    metaContent(
      /<meta\s+(?:property|name)=["']twitter:description["']\s+content=["']([^"']+)["']/i
    ) ??
    metaContent(
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
    );

  const kwRaw = metaContent(
    /<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i
  );
  const keywords = kwRaw
    ? kwRaw
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && s.length < 80)
    : [];

  const section =
    metaContent(
      /<meta\s+(?:property|name)=["']article:section["']\s+content=["']([^"']+)["']/i
    ) ??
    metaContent(
      /<meta\s+(?:property|name)=["']article:tag["']\s+content=["']([^"']+)["']/i
    );

  return { description, keywords, section, image };
}

/** A JSON-LD `image` can be a URL string, an ImageObject ({url|contentUrl}),
 * or an array of either. Return the first usable URL. */
function pickImageUrl(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = pickImageUrl(x);
      if (u) return u;
    }
    return null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const u = o.url ?? o.contentUrl;
    if (typeof u === "string") return u.trim() || null;
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function unwrap(x: unknown): unknown[] {
  if (Array.isArray(x)) return x.flatMap(unwrap);
  if (x && typeof x === "object" && "@graph" in x) {
    const g = (x as Record<string, unknown>)["@graph"];
    if (Array.isArray(g)) return g.flatMap(unwrap);
  }
  return [x];
}

function typeStr(o: Record<string, unknown>): string {
  const t = o["@type"];
  if (Array.isArray(t)) return t.join(",");
  return typeof t === "string" ? t : "";
}

function pickStr(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") {
    return (v[0] as string).trim() || null;
  }
  return null;
}

function parseKeywords(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "string") {
    return v
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 80);
  }
  return [];
}
