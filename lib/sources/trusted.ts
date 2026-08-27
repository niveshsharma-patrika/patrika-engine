/**
 * Allowlist of legitimate, established news publishers that Patrika+ content is
 * allowed to be built from. Both the Google-News grounding AND the OpenAI
 * web-search citations are filtered through this, so generated articles (and the
 * source list shown to the desk) draw only from KNOWN outlets — never arbitrary
 * blogs, SEO/press-release pages or content farms.
 *
 * Matching is deliberately generous WITHIN the allowlist (domain OR publisher
 * name) but closed to anything not listed. Extend the lists below as the desk
 * approves more outlets — this is the single place to do it.
 */

// Known publisher domains (exact host or any subdomain of these).
const TRUSTED_DOMAINS: string[] = [
  // National English
  "ndtv.com", "timesofindia.com", "indiatimes.com", "hindustantimes.com", "thehindu.com",
  "indianexpress.com", "newindianexpress.com", "indiatoday.in", "news18.com", "theprint.in",
  "thewire.in", "scroll.in", "livemint.com", "business-standard.com", "economictimes.com",
  "moneycontrol.com", "firstpost.com", "deccanherald.com", "tribuneindia.com", "telegraphindia.com",
  "outlookindia.com", "thequint.com", "dnaindia.com", "businesstoday.in", "financialexpress.com",
  // Hindi
  "bhaskar.com", "dainikbhaskar.com", "bhaskarhindi.com", "jagran.com", "amarujala.com",
  "patrika.com", "livehindustan.com", "aajtak.in", "abplive.com", "zeenews.india.com",
  "jansatta.com", "prabhatkhabar.com", "punjabkesari.in", "naidunia.com", "lokmat.news",
  "lokmatnews.in", "etvbharat.com", "tv9hindi.com", "tv9bharatvarsh.com", "indiatv.in",
  "indiatvnews.com", "oneindia.com", "jagranjosh.com", "thelallantop.com", "gaonconnection.com",
  "nationalheraldindia.com", "theweek.in", "frontline.thehindu.com",
  // TV / other national
  "cnbctv18.com", "republicworld.com", "timesnownews.com", "wionews.com", "mid-day.com",
  // Wires / official
  "ptinews.com", "aninews.in", "uniindia.com", "prsindia.org",
  // World (for the world desk)
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "aljazeera.com", "theguardian.com",
  // Reference — authoritative panchang / almanac for the Astro desk's dates.
  "drikpanchang.com",
];

// Government / official domains are always trusted.
const TRUSTED_TLDS: string[] = [".gov.in", ".nic.in", ".gov"];

// Distinctive publisher-name keywords — used to match the Google-News <source>
// NAME, which we have before resolving the redirect URL. Kept ≥4 chars / clearly
// distinctive so they don't false-match arbitrary text.
const TRUSTED_NAME_KEYWORDS: string[] = [
  "bhaskar", "jagran", "amar ujala", "amarujala", "patrika", "navbharat times", "hindustan times",
  "livehindustan", "aaj tak", "aajtak", "abplive", "abp news", "zee news", "zeenews", "ndtv",
  "times of india", "the hindu", "indian express", "india today", "news18", "theprint",
  "the print", "the wire", "livemint", "business standard", "economic times", "moneycontrol",
  "firstpost", "deccan herald", "tribune india", "quint", "lokmat", "etv bharat", "tv9",
  "india tv", "jansatta", "prabhat khabar", "punjab kesari", "nai dunia", "naidunia", "cnbc",
  "republic world", "republic bharat", "times now", "reuters", "associated press", "ap news",
  "al jazeera", "the guardian", "dd news", "doordarshan", "kisan tak", "bharat express",
  "oneindia", "financial express", "lallantop", "gaon connection", "national herald",
];

// ── Authoritative reference / evidence sources (evergreen desks) ──────────
// Health, food, education and public-service explainers must take facts from
// AUTHORITATIVE references — named studies, medical / scientific / government /
// academic bodies — not news outlets or blogs. These are trusted IN ADDITION to
// the news list when the desk is an evidence desk (isEvidenceDesk below).
const REFERENCE_DOMAINS: string[] = [
  // Global health / medical
  "who.int", "nih.gov", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov", "medlineplus.gov",
  "cdc.gov", "nhs.uk", "mayoclinic.org", "clevelandclinic.org", "hopkinsmedicine.org",
  "health.harvard.edu", "healthline.com", "medicalnewstoday.com", "webmd.com",
  // Journals / science
  "thelancet.com", "bmj.com", "nejm.org", "nature.com", "sciencedirect.com", "jamanetwork.com",
  // India — health / nutrition / food safety / ayush
  "icmr.gov.in", "mohfw.gov.in", "aiims.edu", "nin.res.in", "fssai.gov.in", "ayush.gov.in",
  "nhp.gov.in",
  // Cancer / oncology (global + India) — Olloi cancer-care desk
  "iarc.who.int", "cancer.gov", "cancer.org", "nccn.org", "esmo.org", "cochrane.org",
  "uicc.org", "tmc.gov.in", "tatamemorialcentre.com", "ncdirindia.org", "ncgrid.org.in",
  "pmjay.gov.in", "ctri.nic.in", "janaushadhi.gov.in", "nppa.gov.in",
  // Nutrition / food
  "eatright.org", "nutritionsource.hsph.harvard.edu", "usda.gov", "fao.org",
  // Education / academic / science
  "unesco.org", "ncert.nic.in", "ugc.gov.in", "aicte-india.org", "arxiv.org", "ieee.org",
  "mit.edu", "stanford.edu", "nasa.gov",
];
// Academic / research TLDs — trusted only for evidence desks.
const REFERENCE_TLDS: string[] = [".edu", ".ac.in", ".edu.in", ".res.in"];

// Desks whose content is an evidence-based explainer (not news). They ADD the
// reference sources above to the trusted set.
const EVIDENCE_DESKS = new Set<string>([
  "health-plus", "food-culture", "ai-education", "public-guide", "nari-shakti",
  "cancer-care",
]);

/** True for desks whose facts should come from authoritative references, not news. */
export function isEvidenceDesk(magKey: string | null | undefined): boolean {
  return !!magKey && EVIDENCE_DESKS.has(magKey);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * True when the URL's host is a known publisher (or a government domain). Pass
 * `{ reference: true }` for evidence desks to ALSO accept authoritative medical /
 * scientific / academic reference sources.
 */
export function isTrustedUrl(
  url: string | null | undefined,
  opts?: { reference?: boolean }
): boolean {
  if (!url) return false;
  const h = hostOf(url);
  if (!h) return false;
  if (TRUSTED_TLDS.some((t) => h === t.slice(1) || h.endsWith(t))) return true;
  if (TRUSTED_DOMAINS.some((d) => h === d || h.endsWith("." + d))) return true;
  if (opts?.reference) {
    if (REFERENCE_TLDS.some((t) => h.endsWith(t))) return true;
    if (REFERENCE_DOMAINS.some((d) => h === d || h.endsWith("." + d))) return true;
  }
  return false;
}

/** True when a Google-News publisher NAME matches a known outlet. */
export function isTrustedPublisherName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return TRUSTED_NAME_KEYWORDS.some((k) => n.includes(k));
}

/** Trusted if EITHER the (resolved) URL host is known OR the publisher name matches. */
export function isTrustedSource(url: string | null | undefined, publisherName?: string | null): boolean {
  return isTrustedUrl(url) || isTrustedPublisherName(publisherName);
}
