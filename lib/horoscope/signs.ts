/** The 12 zodiac signs (rashis), in canonical order. `key` is the stable id
 *  stored in the DB and used in the WordPress payload. */
export type Sign = { key: string; hi: string; en: string; order: number };

export const SIGNS: Sign[] = [
  { key: "mesh",      hi: "मेष",     en: "Aries",       order: 1 },
  { key: "vrishabh",  hi: "वृषभ",    en: "Taurus",      order: 2 },
  { key: "mithun",    hi: "मिथुन",   en: "Gemini",      order: 3 },
  { key: "kark",      hi: "कर्क",    en: "Cancer",      order: 4 },
  { key: "singh",     hi: "सिंह",    en: "Leo",         order: 5 },
  { key: "kanya",     hi: "कन्या",   en: "Virgo",       order: 6 },
  { key: "tula",      hi: "तुला",    en: "Libra",       order: 7 },
  { key: "vrishchik", hi: "वृश्चिक", en: "Scorpio",     order: 8 },
  { key: "dhanu",     hi: "धनु",     en: "Sagittarius", order: 9 },
  { key: "makar",     hi: "मकर",     en: "Capricorn",   order: 10 },
  { key: "kumbh",     hi: "कुंभ",    en: "Aquarius",    order: 11 },
  { key: "meen",      hi: "मीन",     en: "Pisces",      order: 12 },
];

export const SIGN_BY_KEY: Record<string, Sign> = Object.fromEntries(SIGNS.map((s) => [s.key, s]));

/** Best-effort match of a model-returned sign name (key / English / Hindi) to a
 *  canonical key, so generation is robust to how the model labels each sign. */
export function matchSign(raw: string): string | null {
  const n = (raw ?? "").trim().toLowerCase();
  if (!n) return null;
  for (const s of SIGNS) {
    if (n === s.key || n === s.en.toLowerCase() || raw.trim() === s.hi) return s.key;
  }
  // Loose contains fallback (e.g. "Aries (मेष)").
  for (const s of SIGNS) {
    if (n.includes(s.key) || n.includes(s.en.toLowerCase()) || raw.includes(s.hi)) return s.key;
  }
  return null;
}
