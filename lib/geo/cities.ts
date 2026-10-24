/**
 * A curated list of major Indian cities + states, with Hindi names, used to tag
 * stories with a clean City (the data has no geo field — publisher_section is
 * Patrika's internal area-page taxonomy, not a usable location). detectCity()
 * matches the list against a story's text and returns the canonical city.
 * Cities are checked before states so a city match wins.
 */

export type Place = { key: string; en: string; hi: string; aliases?: string[] };

// Major cities (checked first). en = canonical display; hi + aliases help match.
export const CITIES: Place[] = [
  { key: "delhi", en: "Delhi", hi: "दिल्ली", aliases: ["new delhi", "नई दिल्ली"] },
  { key: "mumbai", en: "Mumbai", hi: "मुंबई", aliases: ["bombay"] },
  { key: "bengaluru", en: "Bengaluru", hi: "बेंगलुरु", aliases: ["bangalore", "बैंगलोर"] },
  { key: "kolkata", en: "Kolkata", hi: "कोलकाता", aliases: ["calcutta"] },
  { key: "chennai", en: "Chennai", hi: "चेन्नई", aliases: ["madras"] },
  { key: "hyderabad", en: "Hyderabad", hi: "हैदराबाद" },
  { key: "pune", en: "Pune", hi: "पुणे" },
  { key: "ahmedabad", en: "Ahmedabad", hi: "अहमदाबाद" },
  { key: "jaipur", en: "Jaipur", hi: "जयपुर" },
  { key: "lucknow", en: "Lucknow", hi: "लखनऊ" },
  { key: "kanpur", en: "Kanpur", hi: "कानपुर" },
  { key: "nagpur", en: "Nagpur", hi: "नागपुर" },
  { key: "indore", en: "Indore", hi: "इंदौर" },
  { key: "bhopal", en: "Bhopal", hi: "भोपाल" },
  { key: "patna", en: "Patna", hi: "पटना" },
  { key: "chandigarh", en: "Chandigarh", hi: "चंडीगढ़" },
  { key: "surat", en: "Surat", hi: "सूरत" },
  { key: "vadodara", en: "Vadodara", hi: "वडोदरा", aliases: ["baroda"] },
  { key: "udaipur", en: "Udaipur", hi: "उदयपुर" },
  { key: "jodhpur", en: "Jodhpur", hi: "जोधपुर" },
  { key: "kota", en: "Kota", hi: "कोटा" },
  { key: "ajmer", en: "Ajmer", hi: "अजमेर" },
  { key: "bikaner", en: "Bikaner", hi: "बीकानेर" },
  { key: "jaisalmer", en: "Jaisalmer", hi: "जैसलमेर" },
  { key: "alwar", en: "Alwar", hi: "अलवर" },
  { key: "bharatpur", en: "Bharatpur", hi: "भरतपुर" },
  { key: "sikar", en: "Sikar", hi: "सीकर" },
  { key: "pali", en: "Pali", hi: "पाली" },
  { key: "bhilwara", en: "Bhilwara", hi: "भीलवाड़ा" },
  { key: "gwalior", en: "Gwalior", hi: "ग्वालियर" },
  { key: "varanasi", en: "Varanasi", hi: "वाराणसी", aliases: ["banaras", "benares", "बनारस"] },
  { key: "agra", en: "Agra", hi: "आगरा" },
  { key: "prayagraj", en: "Prayagraj", hi: "प्रयागराज", aliases: ["allahabad", "इलाहाबाद"] },
  { key: "meerut", en: "Meerut", hi: "मेरठ" },
  { key: "ghaziabad", en: "Ghaziabad", hi: "गाजियाबाद" },
  { key: "noida", en: "Noida", hi: "नोएडा" },
  { key: "gurugram", en: "Gurugram", hi: "गुरुग्राम", aliases: ["gurgaon", "गुड़गांव"] },
  { key: "ranchi", en: "Ranchi", hi: "रांची" },
  { key: "raipur", en: "Raipur", hi: "रायपुर" },
  { key: "dehradun", en: "Dehradun", hi: "देहरादून" },
  { key: "shimla", en: "Shimla", hi: "शिमला" },
  { key: "srinagar", en: "Srinagar", hi: "श्रीनगर" },
  { key: "jammu", en: "Jammu", hi: "जम्मू" },
  { key: "guwahati", en: "Guwahati", hi: "गुवाहाटी" },
  { key: "bhubaneswar", en: "Bhubaneswar", hi: "भुवनेश्वर" },
  { key: "visakhapatnam", en: "Visakhapatnam", hi: "विशाखापत्तनम", aliases: ["vizag"] },
  { key: "vijayawada", en: "Vijayawada", hi: "विजयवाड़ा" },
  { key: "coimbatore", en: "Coimbatore", hi: "कोयंबटूर" },
  { key: "kochi", en: "Kochi", hi: "कोच्चि", aliases: ["cochin"] },
  { key: "thiruvananthapuram", en: "Thiruvananthapuram", hi: "तिरुवनंतपुरम", aliases: ["trivandrum"] },
  { key: "mysuru", en: "Mysuru", hi: "मैसूर", aliases: ["mysore"] },
  { key: "amritsar", en: "Amritsar", hi: "अमृतसर" },
  { key: "ludhiana", en: "Ludhiana", hi: "लुधियाना" },
  { key: "rajkot", en: "Rajkot", hi: "राजकोट" },
  { key: "nashik", en: "Nashik", hi: "नासिक" },
  { key: "aurangabad", en: "Aurangabad", hi: "औरंगाबाद" },
];

// States / UTs (checked after cities).
export const STATES: Place[] = [
  { key: "rajasthan", en: "Rajasthan", hi: "राजस्थान" },
  { key: "uttar-pradesh", en: "Uttar Pradesh", hi: "उत्तर प्रदेश", aliases: ["up"] },
  { key: "madhya-pradesh", en: "Madhya Pradesh", hi: "मध्य प्रदेश", aliases: ["mp"] },
  { key: "maharashtra", en: "Maharashtra", hi: "महाराष्ट्र" },
  { key: "gujarat", en: "Gujarat", hi: "गुजरात" },
  { key: "bihar", en: "Bihar", hi: "बिहार" },
  { key: "karnataka", en: "Karnataka", hi: "कर्नाटक" },
  { key: "tamil-nadu", en: "Tamil Nadu", hi: "तमिलनाडु" },
  { key: "telangana", en: "Telangana", hi: "तेलंगाना" },
  { key: "andhra-pradesh", en: "Andhra Pradesh", hi: "आंध्र प्रदेश" },
  { key: "west-bengal", en: "West Bengal", hi: "पश्चिम बंगाल" },
  { key: "kerala", en: "Kerala", hi: "केरल" },
  { key: "punjab", en: "Punjab", hi: "पंजाब" },
  { key: "haryana", en: "Haryana", hi: "हरियाणा" },
  { key: "jharkhand", en: "Jharkhand", hi: "झारखंड" },
  { key: "chhattisgarh", en: "Chhattisgarh", hi: "छत्तीसगढ़" },
  { key: "odisha", en: "Odisha", hi: "ओडिशा" },
  { key: "uttarakhand", en: "Uttarakhand", hi: "उत्तराखंड" },
  { key: "himachal-pradesh", en: "Himachal Pradesh", hi: "हिमाचल प्रदेश" },
  { key: "assam", en: "Assam", hi: "असम" },
  { key: "jammu-kashmir", en: "Jammu & Kashmir", hi: "जम्मू-कश्मीर" },
];

const ALL = [...CITIES, ...STATES];

/** Earliest character index at which this place is mentioned, or -1. English/
 *  latin names use word boundaries; Hindi uses substring (no \b in Devanagari). */
function firstIndex(place: Place, lower: string, raw: string): number {
  let best = Infinity;
  const en = [place.en.toLowerCase(), ...(place.aliases ?? []).filter((a) => /[a-z]/i.test(a)).map((a) => a.toLowerCase())];
  for (const e of en) {
    const m = new RegExp(`\\b${e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).exec(lower);
    if (m && m.index < best) best = m.index;
  }
  const hi = [place.hi, ...(place.aliases ?? []).filter((a) => /[^\x00-\x7F]/.test(a))];
  for (const h of hi) {
    if (!h) continue;
    const i = raw.indexOf(h);
    if (i >= 0 && i < best) best = i;
  }
  return best === Infinity ? -1 : best;
}

/** The canonical display city/state mentioned EARLIEST in the text (the lead
 *  location of a headline), or "" if none. Cities win ties over states. */
export function detectCity(...texts: (string | null | undefined)[]): string {
  const raw = texts.filter(Boolean).join(" ");
  if (!raw) return "";
  const lower = raw.toLowerCase();
  let best = "";
  let bestIdx = Infinity;
  for (const p of ALL) {
    const idx = firstIndex(p, lower, raw);
    if (idx >= 0 && idx < bestIdx) { best = p.en; bestIdx = idx; }
  }
  return best;
}

/** Hindi label for a canonical city/state display name (for the Hindi UI). */
export const CITY_HI: Record<string, string> = Object.fromEntries(ALL.map((p) => [p.en, p.hi]));
