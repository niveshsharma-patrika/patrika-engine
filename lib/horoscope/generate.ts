import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { getApiKey } from "@/lib/ai/provider";
import { normalizeHindiTypography as nz } from "@/lib/text/hindi";
import { SIGNS, matchSign, type Lang } from "./signs";

export type HoroscopeEntry = {
  sign: string; // canonical key
  lang: Lang; // "hi" | "en"
  forecast: string;
  zodiacContent: string;
  luckyColor: string; // shubh rang (name, in this language)
  luckyColorCode: string; // hex, derived from the Hindi colour (shared by both langs)
  luckyNumber: string; // shubh ank (same across languages)
  luckyTime: string; // shubh samay (in this language)
  mood: string;
  solution: string;
};

// Common Hindi colour names → hex, so rashifal_lucky_color_code is always a
// valid colour regardless of what the model returns. Matched by substring.
const COLOR_HEX: Array<[RegExp, string]> = [
  [/लाल|सिंदूरी|रक्त/, "#e53935"],
  [/केसरिया|नारंगी|संतरी|ऑरेंज/, "#fb8c00"],
  [/पीला|पीत|सुनहर|सोन|गोल्ड/, "#fdd835"],
  [/हरा|हरे|हरित/, "#43a047"],
  [/नीला|नीले|आसमानी|नभ|ब्लू/, "#1e88e5"],
  [/गुलाबी|पिंक/, "#ec407a"],
  [/बैंगनी|जामुनी|पर्पल/, "#8e24aa"],
  [/भूरा|कत्थ|ब्राउन/, "#6d4c41"],
  [/सफ़ेद|सफेद|श्वेत|व्हाइट/, "#fafafa"],
  [/काला|काले|श्याम|ब्लैक/, "#212121"],
  [/चांदी|सिल्वर|रुपहल|स्लेटी|ग्रे|धूसर/, "#b0bec5"],
  [/क्रीम|हल्का पीला|बेज/, "#fff2cc"],
  [/फ़िरोज़ी|फिरोजी|टर्क/, "#26c6da"],
  [/मैरून|मरून/, "#880e4f"],
];

function colorHex(nameHi: string): string {
  for (const [re, hex] of COLOR_HEX) if (re.test(nameHi)) return hex;
  return "#cccccc";
}

/**
 * Generate the day's rashifal for all 12 signs in Hindi AND English in one
 * grounded call, using the OpenAI key configured for the app. Pure creative
 * content — no web search. Returns 24 entries (12 signs × 2 languages) in sign
 * order; throws if the model didn't return a usable, complete set of 12.
 */
export async function generateHoroscopes(forDate: string): Promise<HoroscopeEntry[]> {
  const apiKey = await getApiKey("openai");
  if (!apiKey) throw new Error("OpenAI key is not configured.");
  const openai = createOpenAI({ apiKey });
  const model = process.env.HOROSCOPE_MODEL ?? "gpt-4o-mini";

  const dateHi = new Date(`${forDate}T00:00:00+05:30`).toLocaleDateString("hi-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const signList = SIGNS.map((s) => `${s.en} (${s.hi})`).join(", ");

  const { object } = await generateObject({
    model: openai(model),
    temperature: 0.85,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(90_000),
    schema: z.object({
      signs: z.array(
        z.object({
          sign: z.string().describe("The sign's English name, e.g. Aries, Taurus"),
          forecast_hi: z.string(),
          forecast_en: z.string(),
          zodiac_content_hi: z.string(),
          zodiac_content_en: z.string(),
          lucky_color_hi: z.string(),
          lucky_color_en: z.string(),
          lucky_number: z.string(),
          lucky_time_hi: z.string(),
          lucky_time_en: z.string(),
          mood_hi: z.string(),
          mood_en: z.string(),
          solution_hi: z.string(),
          solution_en: z.string(),
        })
      ),
    }),
    prompt: `You are a senior astrologer for Rajasthan Patrika. Prepare the daily rashifal (horoscope) for ${dateHi} for all 12 signs, in BOTH Hindi and English.

Signs (all 12, in this order): ${signList}

For each sign return these fields — the *_hi field in simple conversational Hindi and the *_en field as the faithful English version of the same reading (same meaning, same lucky number):
- sign: the sign's English name (Aries, Taurus, ...).
- forecast_hi / forecast_en: today's general forecast, ~45–80 words. Positive but practical, touching work/career, health, relationships or money as natural. No firm/scary predictions; use soft language ("chances are", "take care").
- zodiac_content_hi / zodiac_content_en: a short sign-specific tip/signal for today, ~20–40 words.
- lucky_color_hi / lucky_color_en: the lucky colour name (e.g. "हरा" / "Green"). Both must be the SAME colour.
- lucky_number: the lucky number(s), e.g. "7" or "3, 9" (same for both languages).
- lucky_time_hi / lucky_time_en: an auspicious time window of the day — Hindi like "सुबह 10:00 – 11:30", English like "10:00 AM – 11:30 AM". Any time of day; both must be the SAME window.
- mood_hi / mood_en: today's mood in a word or two (e.g. "उत्साहित" / "Energetic").
- solution_hi / solution_en: a simple remedy/tip in one line (e.g. "हनुमान चालीसा का पाठ करें" / "Recite Hanuman Chalisa").

Rules:
- Exactly 12 entries, one per sign, no repeats. Each sign's reading must be distinct.
- The English fields must mean the same as the Hindi ones (a translation, not a different reading).
- Return only the requested fields.`,
  });

  const byKey = new Map<string, { hi: HoroscopeEntry; en: HoroscopeEntry }>();
  for (const r of object.signs) {
    const key = matchSign(r.sign);
    if (!key || byKey.has(key)) continue;
    const hex = colorHex(nz((r.lucky_color_hi ?? "").trim()));
    const num = nz((r.lucky_number ?? "").trim());
    byKey.set(key, {
      hi: {
        sign: key, lang: "hi",
        forecast: nz((r.forecast_hi ?? "").trim()),
        zodiacContent: nz((r.zodiac_content_hi ?? "").trim()),
        luckyColor: nz((r.lucky_color_hi ?? "").trim()),
        luckyColorCode: hex, luckyNumber: num,
        luckyTime: nz((r.lucky_time_hi ?? "").trim()),
        mood: nz((r.mood_hi ?? "").trim()),
        solution: nz((r.solution_hi ?? "").trim()),
      },
      en: {
        sign: key, lang: "en",
        forecast: (r.forecast_en ?? "").trim(),
        zodiacContent: (r.zodiac_content_en ?? "").trim(),
        luckyColor: (r.lucky_color_en ?? "").trim(),
        luckyColorCode: hex, luckyNumber: num,
        luckyTime: (r.lucky_time_en ?? "").trim(),
        mood: (r.mood_en ?? "").trim(),
        solution: (r.solution_en ?? "").trim(),
      },
    });
  }
  if (byKey.size !== 12) {
    throw new Error(`Horoscope generation returned ${byKey.size}/12 usable signs.`);
  }
  const out: HoroscopeEntry[] = [];
  for (const s of SIGNS) {
    const pair = byKey.get(s.key)!;
    for (const e of [pair.hi, pair.en]) {
      if (!e.forecast || !e.luckyColor || !e.luckyNumber || !e.luckyTime) {
        throw new Error(`Horoscope for ${s.key} (${e.lang}) has empty required fields.`);
      }
      out.push(e);
    }
  }
  return out;
}
