/**
 * Section gate for clustering eligibility.
 *
 * Each enriched signal carries a `publisher_section` value pulled from the
 * article's JSON-LD or OG metadata — e.g. "India", "Lifestyle", "Markets",
 * "एस्ट्रो टिप्स". Publishers are the most accurate judge of what their
 * own articles are about, so we use that field as a hard gate at the
 * front of the clustering pipeline:
 *
 *   - sections in NEWS_SECTIONS  → embed + cluster (news pipeline)
 *   - sections in FILLER_SECTIONS → kept as signals but NEVER clustered
 *   - sections not in either list (null OR long-tail) → default ALLOW
 *
 * This is the structural fix for the heatwave-mixed-with-cooling-tips
 * problem: tipping articles never reach the embedding step, so they
 * can't pollute a real news cluster downstream.
 *
 * To re-classify a section: move its string into the other set + run a
 * full re-cluster. The gate applies at both embed and coarse-load time,
 * so existing trends won't change but the next cluster pass uses the
 * updated rules.
 */

// Filler: lifestyle, tips, listicles, PR wires, evergreen explainers,
// astrology, photo galleries. Pretty much anything that isn't event-
// driven journalism.
const FILLER_SECTIONS = new Set<string>([
  // ─── English ───
  "Lifestyle",
  "lifestyle",
  "Magazines",
  "htcity",
  "Food",
  "Health",                  // dominated by wellness tips
  "Personal Finance",        // dominated by "5 ways to save" listicles
  "Trending News",
  "trending",
  "Trending",
  "Viral",
  "ANI Press Releases",
  "Press Releases ANI",
  "Education",               // dominated by exam-tip listicles
  "Technology",              // dominated by gadget reviews / listicles
  "Technology & Science",
  "Opinion",                 // mostly evergreen commentary
  "City & states",           // Amar Ujala — mixed quality, mostly travel/listicle
  "City &amp; states",       // HTML-encoded variant
  // ─── Hindi ───
  "लाइफस्टाइल",
  "जीवन-शैली",
  "टिप्स एंड ट्रिक्स",
  "एस्ट्रो टिप्स",
  "अजब-गजब",
  "धर्म",
  "ऑटो",
  "वीडियो न्यूज",
  "कृषि",
]);

// News: event-driven journalism. We allowlist the major news-section
// values so they're explicitly in even if the long-tail default rule
// changes later.
const NEWS_SECTIONS = new Set<string>([
  // ─── English ───
  "News",
  "India",
  "India News",
  "india news",
  "World",
  "World News",
  "Markets",
  "MARKETS",
  "market",
  "earnings",
  "Money",
  "Business",
  "Industry",
  "Companies",
  "Capital Market News",
  "Cricket",
  "cricket",
  "Cricket News",
  "Sports",
  "Bollywood",
  "Movies",
  "Entertainment",
  "entertainment",
  "Celebrities",
  "Cities",
  "cities",
  "Bengaluru",
  "Tamil Nadu",
  "Kerala",
  "Delhi",
  "Mumbai",
  "Bhopal",
  "Lucknow",
  "Jaipur",
  "Legal",
  // ─── Hindi ───
  "बॉलीवुड",
  "उत्तर प्रदेश",
  "बिहार",
  "मध्य प्रदेश",
  "महाराष्ट्र",
  "राष्ट्रीय",
  "देश",
  "दुनिया",
  "इंडिया",
  "क्रिकेट",
  "मनोरंजन",
  "एंटरटेनमेंट",
  "एनसीआर",
  "National News",
  "उत्तर प्रदेश और उत्तराखंड",
]);

/**
 * Returns true if a signal with the given publisher_section should be
 * embedded and considered for clustering. Returns false to keep the
 * signal in the corpus but exclude it from the trends pipeline.
 *
 * Long-tail and unknown (null) sections default to TRUE — we'd rather
 * include the occasional miscategorised filler than miss real news from
 * a small Hindi city desk.
 */
export function isClusterEligible(publisher_section: string | null | undefined): boolean {
  if (!publisher_section) return true;
  const s = publisher_section.trim();
  if (!s) return true;
  if (FILLER_SECTIONS.has(s)) return false;
  return true;
}

/** Exposed for test / debug — see what's in each set. */
export const SECTION_GATE = {
  filler: FILLER_SECTIONS,
  news: NEWS_SECTIONS,
};
