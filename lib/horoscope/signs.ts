/** The 12 zodiac signs (rashis), in canonical order. `key` is the stable id
 *  stored in the DB; `en` (lowercased) is the WordPress `category` slug;
 *  `luckyLetters` are the fixed traditional name-aksharas for the sign. */
export type Sign = { key: string; hi: string; en: string; order: number; luckyLetters: string };

export const SIGNS: Sign[] = [
  { key: "mesh",      hi: "मेष",     en: "Aries",       order: 1,  luckyLetters: "चू, चे, चो, ला, अ" },
  { key: "vrishabh",  hi: "वृषभ",    en: "Taurus",      order: 2,  luckyLetters: "ई, ऊ, ए, ओ, वा" },
  { key: "mithun",    hi: "मिथुन",   en: "Gemini",      order: 3,  luckyLetters: "का, की, कू, घ, छ" },
  { key: "kark",      hi: "कर्क",    en: "Cancer",      order: 4,  luckyLetters: "ही, हू, हे, हो, डा" },
  { key: "singh",     hi: "सिंह",    en: "Leo",         order: 5,  luckyLetters: "मा, मी, मू, मे, टा" },
  { key: "kanya",     hi: "कन्या",   en: "Virgo",       order: 6,  luckyLetters: "टो, पा, पी, पू, ष" },
  { key: "tula",      hi: "तुला",    en: "Libra",       order: 7,  luckyLetters: "रा, री, रू, रे, ता" },
  { key: "vrishchik", hi: "वृश्चिक", en: "Scorpio",     order: 8,  luckyLetters: "तो, ना, नी, नू, या" },
  { key: "dhanu",     hi: "धनु",     en: "Sagittarius", order: 9,  luckyLetters: "ये, यो, भा, भी, धा" },
  { key: "makar",     hi: "मकर",     en: "Capricorn",   order: 10, luckyLetters: "भो, जा, जी, खी, गा" },
  { key: "kumbh",     hi: "कुंभ",    en: "Aquarius",    order: 11, luckyLetters: "गू, गे, गो, सा, दा" },
  { key: "meen",      hi: "मीन",     en: "Pisces",      order: 12, luckyLetters: "दी, दू, थ, झ, चा" },
];

export const SIGN_BY_KEY: Record<string, Sign> = Object.fromEntries(SIGNS.map((s) => [s.key, s]));

/** The WordPress `category` slug for a sign (lowercased English name). */
export const signSlug = (key: string): string => (SIGN_BY_KEY[key]?.en ?? key).toLowerCase();

/** Best-effort match of a model-returned sign name (key / English / Hindi) to a
 *  canonical key, so generation is robust to how the model labels each sign. */
export function matchSign(raw: string): string | null {
  const n = (raw ?? "").trim().toLowerCase();
  if (!n) return null;
  for (const s of SIGNS) {
    if (n === s.key || n === s.en.toLowerCase() || raw.trim() === s.hi) return s.key;
  }
  for (const s of SIGNS) {
    if (n.includes(s.key) || n.includes(s.en.toLowerCase()) || raw.includes(s.hi)) return s.key;
  }
  return null;
}
