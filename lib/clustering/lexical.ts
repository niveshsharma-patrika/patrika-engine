/**
 * No-AI lexical clustering engine.
 *
 * Groups same-story articles across publishers using only text math — no
 * embeddings, no LLM. Ported and cleaned from the original Patrika
 * single-file engine (Archive/server.js). The intuition mirrors how a
 * sub-editor sorts clippings into piles:
 *
 *   1. Clean each headline → tokenize (English + Hindi) → drop stop-words.
 *   2. Build a weighted feature vector: title words, keywords, and
 *      bi/tri-grams carry the most weight (they pin the specific event).
 *   3. Find candidate pairs cheaply via an inverted index (feature →
 *      docs), so we never compare every article to every other.
 *   4. Decide "same story?" with a multi-signal rule combining cosine
 *      similarity, title overlap, strong-token overlap, and shared phrase
 *      "anchors" — plus a same-publisher guard and a time-window guard.
 *   5. Union-Find the linked pairs into clusters.
 *
 * Everything here is pure and deterministic. The DB-facing orchestration
 * (load signals, persist trends, track story age) lives in ./index.ts.
 */

// ─── Tunables ───────────────────────────────────────────────────
// A feature shared by more than this many docs is too generic to imply
// "same story" (e.g. "minister") — skipped during pair generation.
const MAX_FEATURE_DOCS = 70;
// A feature rarer than this is a strong story anchor (e.g. a person's name).
const RARE_FEATURE_DOCS = 30;
// Two articles further apart than this in time are never linked.
const CONTEXT_HOURS = 6;

// ─── Stop-words (EN + HI) + generic anchors ─────────────────────
const STOP_WORDS = new Set<string>([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from", "has", "have", "he", "her",
  "his", "how", "in", "into", "is", "it", "its", "may", "more", "new", "no", "not", "of", "on", "or", "our",
  "over", "said", "says", "she", "so", "than", "that", "the", "their", "this", "to", "under", "up", "was",
  "were", "what", "when", "where", "who", "why", "will", "with", "you", "your", "after", "amid", "before",
  "during", "latest", "live", "news", "today", "update", "updates", "video", "watch", "photo", "photos",
  "india", "indian", "indians", "english", "hindi", "report", "reports", "story", "read", "breaking",
  "thehindu", "hindu", "toi", "times", "hindustan", "express", "ndtv", "news18", "abp", "mint", "scroll",
  "wire", "print", "jagran", "amar", "ujala", "patrika", "jansatta", "zee", "moneycontrol",
  "के", "की", "का", "को", "में", "से", "पर", "और", "है", "हैं", "ने", "तो", "ही", "भी", "नहीं", "लिए",
  "आज", "अब", "तक", "बड़ी", "बड़ा", "खबर", "लाइव", "वीडियो", "देखें", "क्या", "क्यों", "कैसे",
]);

const GENERIC_ANCHOR_WORDS = new Set<string>([
  "account", "app", "box", "breaking", "chief", "court", "cricket", "delhi", "election", "film", "government",
  "high", "india", "indian", "ipl", "latest", "live", "match", "minister", "movie", "mumbai", "news", "office",
  "party", "political", "politics", "review", "series", "sports", "supreme", "today", "trailer", "update",
  "updates", "viral", "watch",
]);

// Canonicalise publisher names so two feeds from the same outlet (e.g. TOI
// sitemap + TOI RSS) count as ONE publisher for the 3-source rule.
// Matched as SUBSTRINGS against the normalised name (punctuation → spaces),
// so section-prefixed feed titles fold correctly: "Sports | The Indian
// Express" and "India | The Indian Express" both → "indian express".
// ORDER MATTERS — more specific names first so "new indian express" doesn't
// collapse into "indian express", and "the hindu" never matches "hindustan".
const PUBLISHER_ALIASES: Array<[RegExp, string]> = [
  // ── India ──
  [/new\s+indian\s+express/i, "new indian express"],   // BEFORE indian express
  [/indian\s+express/i, "indian express"],
  [/economic\s+times/i, "economic times"],
  [/times\s+of\s+india|\btoi\b/i, "times of india"],
  [/times\s+now/i, "times now"],
  [/hindustan\s+hindi|live\s*hindustan/i, "hindustan hindi"],
  [/hindustan\s+times/i, "hindustan times"],
  [/\bthe\s+hindu\b/i, "the hindu"],                    // \b keeps it off "hindustan"
  [/news\s*18|cnn\s*news18/i, "news18"],
  [/india\s+today/i, "india today"],
  [/\bndtv\b/i, "ndtv"],                                // folds NDTV Sports / Profit / …
  [/aaj\s*tak/i, "aaj tak"],
  [/amar\s+ujala/i, "amar ujala"],
  [/dainik\s+bhaskar|\bbhaskar\b/i, "dainik bhaskar"],
  [/dainik\s+jagran|\bjagran\b/i, "dainik jagran"],
  [/zee\s+news/i, "zee news"],
  [/\babp\b/i, "abp"],
  [/cnbc\s*tv18/i, "cnbc tv18"],                        // BEFORE cnbc
  [/moneycontrol/i, "moneycontrol"],
  [/business\s+standard/i, "business standard"],
  [/livemint|\bmint\b/i, "mint"],
  [/financial\s+express/i, "financial express"],
  [/business\s+today/i, "business today"],
  [/forbes\s+india/i, "forbes india"],
  [/espn\s*cricinfo/i, "espn cricinfo"],
  [/sportstar/i, "sportstar"],
  [/deccan\s+herald/i, "deccan herald"],
  [/the\s+tribune/i, "the tribune"],
  [/telegraph/i, "the telegraph"],
  [/\bdna\b/i, "dna india"],
  [/republic\s+world|republic\s+tv/i, "republic"],
  [/the\s+print|theprint/i, "the print"],
  [/the\s+wire/i, "the wire"],
  [/\bscroll\b/i, "scroll"],
  [/rajasthan\s+patrika|\bpatrika\b/i, "rajasthan patrika"],
  [/bollywood\s+hungama/i, "bollywood hungama"],
  [/pinkvilla/i, "pinkvilla"],
  [/gadgets\s*360/i, "gadgets360"],
  // ── International ──
  [/\bbbc\b/i, "bbc"],
  [/the\s+guardian|theguardian/i, "the guardian"],
  [/\breuters\b/i, "reuters"],
  [/new\s+york\s+times|nytimes|\bnyt\b/i, "new york times"],
  [/al\s*jazeera/i, "al jazeera"],
  [/\bcnn\b/i, "cnn"],
  [/deutsche\s+welle|\bdw\b/i, "dw"],
  [/france\s*24/i, "france24"],
  [/financial\s+times/i, "financial times"],
  [/\bcnbc\b/i, "cnbc"],
  [/techcrunch/i, "techcrunch"],
  [/the\s+verge/i, "the verge"],
  [/ars\s+technica/i, "ars technica"],
  [/engadget/i, "engadget"],
  [/\bvariety\b/i, "variety"],
  [/sky\s+sports/i, "sky sports"],
];

// The set of "major" publishers = every outlet we have an alias for (the
// well-known national + international names). A story covered ONLY by
// long-tail / local outlets (which canonicalise to their bare names, not an
// alias) is corroborated but not prominent — used to keep trivial local
// stories out of Breaking/Trending.
export const MAJOR_PUBLISHERS: ReadonlySet<string> = new Set(
  PUBLISHER_ALIASES.map(([, alias]) => alias)
);

/** True if a (raw) publisher name resolves to a known major outlet. */
export function isMajorPublisher(name: string): boolean {
  return MAJOR_PUBLISHERS.has(canonicalPublisherKey(name));
}

// Broad sections that may merge with each other when the story link is
// strong. Keeps sports out of business unless the evidence is overwhelming.
const CATEGORY_GROUPS: Record<string, string> = {
  national: "public", politics: "public", courts: "public", crime: "public", education: "public",
  world: "world", business: "business", markets: "business", sports: "sports", cricket: "sports",
  entertainment: "entertainment", bollywood: "entertainment", health: "health", technology: "technology",
};

// ─── Public types ───────────────────────────────────────────────

/** Minimal, DB-agnostic input for one article. */
export type SignalInput = {
  id: string;
  title: string;
  excerpt: string;
  keywords: string[];
  section: string | null;
  publisher: string;
  publishedAtMs: number;
  url: string | null;
  sourceId: string | null;
  topicId: string | null;
  language: string | null;
  focus: string | null; // the source's category (sports/business/world/…), if any
};

/** A fully-featurised article, ready to cluster. */
export type LexicalDoc = {
  id: string;
  title: string;
  excerpt: string;
  text: string;
  publisher: string;
  publisherKey: string;
  category: string;
  timeMs: number;
  url: string | null;
  sourceId: string | null;
  topicId: string | null;
  language: string | null;
  featureWeights: Map<string, number>;
  norm: number;
  strongTokens: Set<string>;
  phraseTokens: Set<string>;
  storyPhraseTokens: Set<string>;
  titleFeatureSet: Set<string>;
  anchorTokens: Set<string>;
};

// ─── Text helpers ───────────────────────────────────────────────

function codePoint(n: number): string {
  try {
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

/** Decode HTML entities — numeric (&#8217; / &#x2019;) and the common named
 * ones — so headlines don't show raw "&#8217;s". */
export function decodeEntities(s: string): string {
  return String(s || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&lsquo;|&apos;/g, "'")
    .replace(/&rdquo;|&ldquo;|&quot;/g, '"')
    .replace(/&ndash;|&mdash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cleanText(value: string): string {
  return decodeEntities(String(value || ""))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanStoryTitle(value: string): string {
  return cleanText(value)
    .replace(/\s+\|\s+.*$/, "")
    .replace(/\s+-\s+[^-]{2,80}$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulExcerpt(value: string): string {
  const text = cleanText(value);
  if (/latest news|news from india|external affairs|gender and culture/i.test(text)) return "";
  if (text.length < 24) return "";
  return text;
}

export function tokenize(value: string): string[] {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (normalized.match(/[\p{L}\p{N}]+/gu) || [])
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .slice(0, 120);
}

function ngrams(tokens: string[], size: number): string[] {
  const items: string[] = [];
  for (let i = 0; i <= tokens.length - size; i += 1) {
    const parts = tokens.slice(i, i + size);
    if (parts.some((p) => STOP_WORDS.has(p))) continue;
    items.push(parts.join("_"));
  }
  return items;
}

function isStrongToken(token: string): boolean {
  if (!token || STOP_WORDS.has(token)) return false;
  if (/^\d+$/.test(token)) return token.length >= 2;
  if (/[\u0900-\u097f]/.test(token)) return token.length >= 2; // Devanagari
  return token.length >= 4;
}

function isStoryAnchorFeature(feature: string): boolean {
  const parts = String(feature || "").split("_").filter(Boolean);
  if (!parts.length) return false;
  const meaningful = parts.filter(
    (p) => isStrongToken(p) && !/^\d+$/.test(p) && !GENERIC_ANCHOR_WORDS.has(p)
  );
  if (!meaningful.length) return false;
  if (parts.length === 1) return meaningful[0].length >= 5;
  return meaningful.length >= 2;
}

export function canonicalPublisherKey(name: string): string {
  // Normalise punctuation to spaces but keep all words (incl. a leading
  // "the") so the substring aliases below can match reliably.
  const norm = cleanText(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, alias] of PUBLISHER_ALIASES) {
    if (pattern.test(norm)) return alias;
  }
  // No known publisher matched — fall back to the bare name minus "the".
  return norm.replace(/^the\s+/, "");
}

function normalizeCategory(value: string): string {
  const c = String(value || "national").toLowerCase().trim();
  if (c === "top") return "national";
  if (c === "markets") return "business";
  if (c === "cricket") return "sports";
  if (c === "bollywood") return "entertainment";
  return CATEGORY_GROUPS[c] ? c : "national";
}

// A category-specific feed is the most reliable signal of a story's beat —
// trust it over headline keywords. General/national feeds fall through to
// the keyword classifier below.
const FOCUS_TO_CATEGORY: Record<string, string> = {
  sports: "sports",
  business: "business",
  markets: "business",
  tech: "technology",
  technology: "technology",
  enter: "entertainment",
  entertainment: "entertainment",
  world: "world",
  politics: "politics",
};

function inferCategory(input: SignalInput): string {
  if (input.focus) {
    const mapped = FOCUS_TO_CATEGORY[input.focus.trim().toLowerCase()];
    if (mapped) return mapped;
  }
  const source = input.publisher.toLowerCase();
  const text = `${input.section || ""} ${input.title} ${input.keywords.join(" ")}`.toLowerCase();
  const combined = `${source} ${text}`;
  if (/\b(espn|sportstar|cricket|ipl|bcci|sports?|football|hockey|kabaddi|tennis|match|t20|odi)\b/.test(combined)) return "sports";
  if (/\b(bollywood|film|cinema|ott|actor|actress|movie|entertainment|celebrity|celeb|trailer|box office|reality show|television)\b/.test(text)) return "entertainment";
  if (/\b(exam|school|college|university|education|neet|jee|cbse|result|admission|nta|paper leak)\b/.test(text)) return "education";
  if (/\b(health|healthcare|hospital|doctor|medicine|medical|covid|disease|vaccine|virus|outbreak|screening|insurance)\b/.test(text)) return "health";
  if (/\b(court|supreme court|high court|chief justice|judge|legal|law|plea|petition|bail)\b/.test(text)) return "courts";
  if (/\b(crime|murder|police|arrest|rape|fraud|probe|investigation|fir|ed|cbi|racket)\b/.test(text)) return "crime";
  if (/\b(election|bjp|congress|aap|tmc|dmk|parliament|minister|modi|rahul|politics|political|government|govt|cm|pm)\b/.test(text)) return "politics";
  if (/\b(world|global|africa|trump|china|usa|russia|pakistan|israel|iran|ukraine|gaza|nepal|bangladesh|sri lanka)\b/.test(text)) return "world";
  if (/\b(technology|startup|startups|artificial intelligence|telecom|iphone|android|smartphone|snapdragon|samsung|pixel|laptop|gadget|cyber|isro)\b/.test(text)) return "technology";
  if (/\b(moneycontrol|economic times|business standard|mint|cnbc|financial express|business today|forbes|market|markets|sensex|nifty|stock|rupee|rbi|sebi|ipo|revenue|profit|bank|banking|economy|gdp|shares?)\b/.test(combined)) return "business";
  return "national";
}

function latinRatio(value: string): number {
  const letters = String(value || "").match(/\p{L}/gu) || [];
  if (!letters.length) return 0;
  const latin = String(value).match(/[a-z]/gi) || [];
  return latin.length / letters.length;
}

function addFeatures(features: Map<string, number>, tokens: string[], weight: number): void {
  for (const token of tokens) {
    if (!token || STOP_WORDS.has(token)) continue;
    features.set(token, (features.get(token) || 0) + weight);
  }
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      url.searchParams.delete(k);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function normalizeComparable(value: string): string {
  return tokenize(value).join(" ");
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const unionSize = new Set([...a, ...b]).size;
  if (!unionSize) return 0;
  return intersectionCount(a, b) / unionSize;
}

function intersectionCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) count += 1;
  return count;
}

// ─── Doc construction ───────────────────────────────────────────

const FUTURE_SLACK_MS = 10 * 60 * 1000;

/**
 * Featurise one article. Returns null for articles too thin to cluster
 * (no publisher, fewer than 3 distinct features). `nowMs` clamps
 * future-dated timestamps to now so a mis-dated feed can't dominate.
 */
export function makeLexicalDoc(input: SignalInput, nowMs: number): LexicalDoc | null {
  if (!input.publisher) return null;
  const timeMs =
    input.publishedAtMs <= nowMs + FUTURE_SLACK_MS ? input.publishedAtMs : nowMs;

  const title = cleanStoryTitle(input.title);
  const excerpt = meaningfulExcerpt(input.excerpt);
  const keywordText = input.keywords.join(" ");
  const section = input.section || "";

  const titleTokens = tokenize(title);
  const excerptTokens = tokenize(excerpt).slice(0, 80);
  const keywordTokens = tokenize(keywordText);
  const sectionTokens = tokenize(section);

  const featureWeights = new Map<string, number>();
  addFeatures(featureWeights, titleTokens, 3.2);
  addFeatures(featureWeights, excerptTokens, 1);
  addFeatures(featureWeights, keywordTokens, 3.5);
  addFeatures(featureWeights, sectionTokens, 1.2);
  addFeatures(featureWeights, ngrams(titleTokens, 2), 5);
  addFeatures(featureWeights, ngrams(titleTokens, 3), 6);
  addFeatures(featureWeights, ngrams(keywordTokens, 2), 4);

  if (featureWeights.size < 3) return null;

  const strongTokens = new Set(
    [...titleTokens, ...keywordTokens].filter(isStrongToken)
  );
  const phraseTokens = new Set([
    ...ngrams(titleTokens, 2),
    ...ngrams(titleTokens, 3),
    ...ngrams(keywordTokens, 2),
  ]);
  const storyPhraseTokens = new Set([...phraseTokens].filter(isStoryAnchorFeature));
  const titleFeatureSet = new Set([...titleTokens, ...ngrams(titleTokens, 2)]);
  const norm = Math.sqrt(
    [...featureWeights.values()].reduce((s, w) => s + w * w, 0)
  );

  return {
    id: input.id,
    title,
    excerpt,
    text: [title, excerpt, keywordText, section].filter(Boolean).join(" "),
    publisher: input.publisher,
    publisherKey: canonicalPublisherKey(input.publisher),
    category: inferCategory(input),
    timeMs,
    url: input.url,
    sourceId: input.sourceId,
    topicId: input.topicId,
    language: input.language,
    featureWeights,
    norm,
    strongTokens,
    phraseTokens,
    storyPhraseTokens,
    titleFeatureSet,
    anchorTokens: new Set(),
  };
}

// ─── Union-Find ─────────────────────────────────────────────────

type UnionFind = {
  find(i: number): number;
  union(a: number, b: number): void;
};

function createUnionFind(size: number): UnionFind {
  const parents = Array.from({ length: size }, (_, i) => i);
  const ranks = new Array(size).fill(0);
  const uf: UnionFind = {
    find(i: number): number {
      if (parents[i] !== i) parents[i] = uf.find(parents[i]);
      return parents[i];
    },
    union(a: number, b: number): void {
      let ra = uf.find(a);
      let rb = uf.find(b);
      if (ra === rb) return;
      if (ranks[ra] < ranks[rb]) [ra, rb] = [rb, ra];
      parents[rb] = ra;
      if (ranks[ra] === ranks[rb]) ranks[ra] += 1;
    },
  };
  return uf;
}

// ─── Linking passes ─────────────────────────────────────────────

/** Merge obvious duplicates: same canonical URL or identical headline. */
function mergeExactMatches(docs: LexicalDoc[], union: UnionFind): void {
  const urlSeen = new Map<string, number>();
  const titleSeen = new Map<string, number>();
  docs.forEach((doc, i) => {
    if (doc.url) {
      const key = normalizeUrl(doc.url);
      if (urlSeen.has(key)) union.union(i, urlSeen.get(key)!);
      urlSeen.set(key, i);
    }
    const titleKey = normalizeComparable(doc.title);
    if (titleKey && titleKey.length > 24) {
      if (titleSeen.has(titleKey)) union.union(i, titleSeen.get(titleKey)!);
      titleSeen.set(titleKey, i);
    }
  });
}

/**
 * Inverted-index pass: find candidate pairs that share mid-frequency
 * features, score each pair by weighted dot product, then apply the
 * same-story rule. O(n²) is avoided — only docs sharing a feature are
 * ever compared, and ultra-common features are skipped.
 */
function mergeSemanticMatches(docs: LexicalDoc[], union: UnionFind): void {
  const docFrequency = new Map<string, number>();
  for (const doc of docs) {
    for (const feature of doc.featureWeights.keys()) {
      docFrequency.set(feature, (docFrequency.get(feature) || 0) + 1);
    }
  }

  const index = new Map<string, Array<[number, number]>>();
  docs.forEach((doc, docIndex) => {
    doc.anchorTokens = new Set(
      [...doc.strongTokens, ...doc.storyPhraseTokens].filter((feature) => {
        const count = docFrequency.get(feature) || 0;
        return count >= 2 && count <= RARE_FEATURE_DOCS && isStoryAnchorFeature(feature);
      })
    );
    for (const [feature, weight] of doc.featureWeights.entries()) {
      const count = docFrequency.get(feature) || 0;
      if (count < 2 || count > MAX_FEATURE_DOCS) continue;
      if (!index.has(feature)) index.set(feature, []);
      index.get(feature)!.push([docIndex, weight]);
    }
  });

  const pairScores = new Map<string, number>();
  for (const postings of index.values()) {
    for (let l = 0; l < postings.length; l += 1) {
      for (let r = l + 1; r < postings.length; r += 1) {
        const [li, lw] = postings[l];
        const [ri, rw] = postings[r];
        if (Math.abs(docs[li].timeMs - docs[ri].timeMs) > CONTEXT_HOURS * 60 * 60 * 1000) continue;
        const key = li < ri ? `${li}:${ri}` : `${ri}:${li}`;
        pairScores.set(key, (pairScores.get(key) || 0) + lw * rw);
      }
    }
  }

  for (const [key, dot] of pairScores.entries()) {
    const [li, ri] = key.split(":").map(Number);
    const left = docs[li];
    const right = docs[ri];
    const similarity = dot / Math.max(0.0001, left.norm * right.norm);
    const titleSimilarity = jaccard(left.titleFeatureSet, right.titleFeatureSet);
    const strongOverlap = intersectionCount(left.strongTokens, right.strongTokens);
    const phraseOverlap = intersectionCount(left.storyPhraseTokens, right.storyPhraseTokens);
    const anchorOverlap = intersectionCount(left.anchorTokens, right.anchorTokens);
    if (shouldLink({ left, right, similarity, titleSimilarity, strongOverlap, phraseOverlap, anchorOverlap })) {
      union.union(li, ri);
    }
  }
}

type LinkMetrics = {
  left: LexicalDoc;
  right: LexicalDoc;
  similarity: number;
  titleSimilarity: number;
  strongOverlap: number;
  phraseOverlap: number;
  anchorOverlap: number;
};

/** The "is this the same news event?" decision. Tiered rules, tuned on
 * real Indian-newswire data. Same-publisher pairs never link (we want
 * distinct outlets), and categories must be compatible. */
function shouldLink(m: LinkMetrics): boolean {
  const { left, right, similarity, titleSimilarity, strongOverlap, phraseOverlap, anchorOverlap } = m;
  if (left.publisherKey === right.publisherKey) return false;
  const timeHours = Math.abs(left.timeMs - right.timeMs) / (60 * 60 * 1000);
  if (!categoriesCompatible(left.category, right.category, { similarity, phraseOverlap, anchorOverlap })) return false;
  if (titleSimilarity >= 0.68 && strongOverlap >= 3 && anchorOverlap >= 1) return true;
  if (phraseOverlap >= 3 && similarity >= 0.28 && anchorOverlap >= 1) return true;
  if (phraseOverlap >= 2 && similarity >= 0.42 && strongOverlap >= 2 && anchorOverlap >= 1) return true;
  if (similarity >= 0.52 && strongOverlap >= 3 && phraseOverlap >= 1 && anchorOverlap >= 2) return true;
  if (similarity >= 0.6 && strongOverlap >= 2 && phraseOverlap >= 1 && anchorOverlap >= 2 && timeHours <= 1.5) return true;
  return false;
}

function categoriesCompatible(
  left: string,
  right: string,
  metrics: { similarity: number; phraseOverlap: number; anchorOverlap: number }
): boolean {
  const l = normalizeCategory(left);
  const r = normalizeCategory(right);
  if (l === r) return true;
  const lg = CATEGORY_GROUPS[l] || "public";
  const rg = CATEGORY_GROUPS[r] || "public";
  if (lg === rg) return true;
  const { similarity, phraseOverlap, anchorOverlap } = metrics;
  const strongStoryLink = anchorOverlap >= 2 && (phraseOverlap >= 1 || similarity >= 0.5);
  if (l === "national" || r === "national") return strongStoryLink;
  if (lg === "public" || rg === "public") return anchorOverlap >= 2 && phraseOverlap >= 1 && similarity >= 0.45;
  return anchorOverlap >= 3 && phraseOverlap >= 2 && similarity >= 0.58;
}

// ─── Entry point ────────────────────────────────────────────────

/**
 * Cluster a list of featurised docs into same-story groups. Returns an
 * array of clusters (each a list of member docs), including singletons —
 * the caller decides what to keep.
 */
export function clusterDocs(docs: LexicalDoc[]): LexicalDoc[][] {
  const union = createUnionFind(docs.length);
  mergeExactMatches(docs, union);
  mergeSemanticMatches(docs, union);

  const groups = new Map<number, LexicalDoc[]>();
  docs.forEach((doc, i) => {
    const root = union.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(doc);
  });
  return [...groups.values()];
}

// ─── Cluster → editorial fields (no AI) ─────────────────────────

/** Distinct canonical publishers in a cluster. */
export function distinctPublishers(cluster: LexicalDoc[]): string[] {
  return [...new Set(cluster.map((d) => d.publisherKey))];
}

/** The most common non-trivial category across the cluster. */
export function clusterCategory(cluster: LexicalDoc[]): string {
  const counts = new Map<string, number>();
  for (const d of cluster) counts.set(d.category, (counts.get(d.category) || 0) + 1);
  let best = "national";
  let bestN = 0;
  for (const [c, n] of counts) if (n > bestN) { bestN = n; best = c; }
  return best;
}

/** Tokens/phrases that ≥2 publishers in the cluster share — the spine of
 * the story. Used to pick a representative headline. */
export function commonSignals(cluster: LexicalDoc[]): string[] {
  const byToken = new Map<string, Set<string>>();
  for (const doc of cluster) {
    for (const token of [...doc.strongTokens, ...doc.phraseTokens]) {
      if (!byToken.has(token)) byToken.set(token, new Set());
      byToken.get(token)!.add(doc.publisherKey);
    }
  }
  return [...byToken.entries()]
    .map(([token, pubs]) => ({ token: token.replace(/_/g, " "), n: pubs.size }))
    .filter((it) => it.n >= 2 && isUsefulCommonSignal(it.token))
    .sort((a, b) => b.n - a.n || b.token.length - a.token.length)
    .slice(0, 8)
    .map((it) => it.token);
}

function isUsefulCommonSignal(signal: string): boolean {
  return String(signal || "")
    .split(/\s+/)
    .some((p) => p.length >= 4 && !/^\d+$/.test(p) && !GENERIC_ANCHOR_WORDS.has(p));
}

/** Pick the clearest real headline to represent the cluster — no LLM. We
 * favour Latin-script, well-formed, on-topic headlines from real outlets. */
export function chooseHeadline(cluster: LexicalDoc[]): LexicalDoc {
  const signals = commonSignals(cluster);
  let best = cluster[0];
  let bestScore = -Infinity;
  for (const doc of cluster) {
    let score = doc.strongTokens.size * 0.4 + doc.phraseTokens.size * 0.2;
    if (meaningfulExcerpt(doc.excerpt)) score += 1;
    if (latinRatio(doc.title) > 0.65) score += 1.5;
    score += Math.min(2, doc.title.length / 60);
    if (doc.title.length < 18) score -= 2;
    score += storySignalScore(doc, signals);
    if (score > bestScore) { best = doc; bestScore = score; }
  }
  return best;
}

function storySignalScore(doc: LexicalDoc, signals: string[]): number {
  const title = normalizeComparable(doc.title);
  const text = normalizeComparable(doc.text);
  let score = 0;
  for (const signal of signals.slice(0, 5)) {
    const n = normalizeComparable(signal);
    if (!n || n.length < 4) continue;
    if (title.includes(n)) score += 2.2;
    else if (text.includes(n)) score += 0.7;
  }
  return score;
}

/** A plain editorial "what to do" line, rule-based. */
export function coverageSuggestion(publisherCount: number, articleCount: number, category: string): string {
  if (publisherCount >= 5) return `High-coverage ${category} story: cover quickly, then add context or explain what changes for readers.`;
  if (articleCount > publisherCount) return `Developing ${category} story: compare updates across publishers and find the strongest fresh angle.`;
  return `Emerging ${category} story: verify the common facts and watch for one distinctive angle before writing.`;
}

/** Map an internal category to the dashboard section key. */
export function sectionForCategory(category: string): string {
  const c = normalizeCategory(category);
  if (c === "business" || c === "markets") return "business";
  if (c === "sports" || c === "cricket") return "sports";
  if (c === "politics" || c === "courts" || c === "crime") return "politics";
  if (c === "entertainment" || c === "bollywood") return "enter";
  if (c === "technology") return "tech";
  if (c === "world") return "world";
  if (c === "health") return "national";
  return "national";
}
