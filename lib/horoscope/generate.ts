import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { getApiKey } from "@/lib/ai/provider";
import { normalizeHindiTypography as nz } from "@/lib/text/hindi";
import { SIGNS, matchSign } from "./signs";

export type HoroscopeEntry = {
  sign: string; // canonical key
  forecast: string; // today's general forecast
  zodiacContent: string; // sign-specific guidance
  luckyColor: string; // shubh rang (name)
  luckyColorCode: string; // hex, derived from the name
  luckyNumber: string; // shubh ank
  luckyTime: string; // shubh samay (any time window)
  mood: string;
  solution: string; // upaay / remedy
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

function colorHex(name: string, fallback?: string): string {
  for (const [re, hex] of COLOR_HEX) if (re.test(name)) return hex;
  if (fallback && /^#[0-9a-fA-F]{6}$/.test(fallback.trim())) return fallback.trim().toLowerCase();
  return "#cccccc";
}

/**
 * Generate the day's rashifal for all 12 signs in one grounded call, using the
 * OpenAI key configured for the app. Pure creative content — no web search.
 * Returns entries in canonical sign order; throws if the model didn't return a
 * usable, complete set of 12 (so the caller can mark it failed/retry).
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
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(90_000),
    schema: z.object({
      signs: z.array(
        z.object({
          sign: z.string().describe("The sign's English name, e.g. Aries, Taurus"),
          forecast: z.string(),
          zodiac_content: z.string(),
          lucky_color: z.string(),
          lucky_number: z.string(),
          lucky_time: z.string(),
          mood: z.string(),
          solution: z.string(),
        })
      ),
    }),
    prompt: `तुम राजस्थान पत्रिका के अनुभवी ज्योतिष लेखक हो। ${dateHi} के लिए सभी 12 राशियों का दैनिक राशिफल तैयार करो।

राशियाँ (सभी 12, इसी क्रम में): ${signList}

हर राशि के लिए ये फ़ील्ड दो:
1. sign — राशि का अंग्रेज़ी नाम (Aries, Taurus, ...)।
2. forecast — आज का सामान्य राशिफल, सरल बोलचाल की हिंदी में, लगभग 45–80 शब्द। सकारात्मक पर व्यावहारिक; काम/करियर, सेहत, रिश्ते, धन में से जो स्वाभाविक हो उसे छूते हुए। कोई पक्का/डरावना दावा नहीं; "संभावना है", "ध्यान रखें" जैसी सहज भाषा।
3. zodiac_content — इस राशि वालों के लिए आज की खास सलाह/संकेत, 20–40 शब्द।
4. lucky_color — शुभ रंग (एक रंग का हिंदी नाम, जैसे "हरा", "पीला", "लाल")।
5. lucky_number — शुभ अंक (एक या दो अंक, जैसे "7" या "3, 9")।
6. lucky_time — शुभ समय / मुहूर्त, दिन का कोई एक स्वाभाविक समय-खंड (जैसे "सुबह 10:00 – 11:30" या "शाम 6:00 – 7:00")। दिन के किसी भी समय का हो सकता है।
7. mood — आज का मूड, एक-दो शब्द में (जैसे "उत्साहित", "शांत", "आत्मविश्वास से भरा")।
8. solution — आज का सरल उपाय/समाधान, एक पंक्ति में (जैसे "हनुमान चालीसा का पाठ करें", "जरूरतमंद को भोजन कराएँ")।

नियम:
- ठीक 12 प्रविष्टियाँ, हर राशि के लिए एक, कोई दोहराव नहीं।
- हर राशि का राशिफल अलग और विशिष्ट हो — सब एक जैसे नहीं।
- सिर्फ़ माँगे गए फ़ील्ड लौटाओ; कोई अतिरिक्त टिप्पणी नहीं।`,
  });

  const byKey = new Map<string, HoroscopeEntry>();
  for (const r of object.signs) {
    const key = matchSign(r.sign);
    if (!key || byKey.has(key)) continue;
    const luckyColor = nz((r.lucky_color ?? "").trim());
    byKey.set(key, {
      sign: key,
      forecast: nz((r.forecast ?? "").trim()),
      zodiacContent: nz((r.zodiac_content ?? "").trim()),
      luckyColor,
      luckyColorCode: colorHex(luckyColor),
      luckyNumber: nz((r.lucky_number ?? "").trim()),
      luckyTime: nz((r.lucky_time ?? "").trim()),
      mood: nz((r.mood ?? "").trim()),
      solution: nz((r.solution ?? "").trim()),
    });
  }
  if (byKey.size !== 12) {
    throw new Error(`Horoscope generation returned ${byKey.size}/12 usable signs.`);
  }
  return SIGNS.map((s) => {
    const e = byKey.get(s.key)!;
    if (!e.forecast || !e.luckyColor || !e.luckyNumber || !e.luckyTime) {
      throw new Error(`Horoscope for ${s.key} has empty required fields.`);
    }
    return e;
  });
}
