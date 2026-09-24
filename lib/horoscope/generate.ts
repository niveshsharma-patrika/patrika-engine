import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { getApiKey } from "@/lib/ai/provider";
import { normalizeHindiTypography as nz } from "@/lib/text/hindi";
import { SIGNS, matchSign } from "./signs";

export type HoroscopeEntry = {
  sign: string; // canonical key
  forecast: string;
  shubhRang: string;
  shubhAnk: string;
  shubhSamay: string;
};

/**
 * Generate the day's rashifal for all 12 signs in one grounded call, using the
 * OpenAI key already configured for the app. Pure creative content — no web
 * search. Returns entries in canonical sign order; throws if the model didn't
 * return a usable, complete set of 12 (so the caller can mark it failed/retry).
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
    // Bound the call so a stalled generation can't eat the whole cron budget
    // (leaving room for the WordPress push after it).
    abortSignal: AbortSignal.timeout(90_000),
    schema: z.object({
      signs: z
        .array(
          z.object({
            sign: z.string().describe("The sign's English name, e.g. Aries, Taurus"),
            forecast: z.string(),
            shubh_rang: z.string(),
            shubh_ank: z.string(),
            shubh_samay: z.string(),
          })
        )
        .length(12),
    }),
    prompt: `तुम राजस्थान पत्रिका के अनुभवी ज्योतिष लेखक हो। ${dateHi} के लिए सभी 12 राशियों का दैनिक राशिफल तैयार करो।

राशियाँ (सभी 12, इसी क्रम में): ${signList}

हर राशि के लिए दो:
1. sign — राशि का अंग्रेज़ी नाम (Aries, Taurus, ...)।
2. forecast — आज का राशिफल, सरल बोलचाल की हिंदी में, लगभग 45–80 शब्द। सकारात्मक पर व्यावहारिक; काम/करियर, सेहत, रिश्ते/परिवार, धन में से जो उस राशि के लिए स्वाभाविक हो उसे छूते हुए। कोई पक्का/डरावना दावा नहीं (जैसे बीमारी/मृत्यु/नुकसान की भविष्यवाणी नहीं); "संभावना है", "ध्यान रखें", "अच्छा दिन रहेगा" जैसी सहज भाषा।
3. shubh_rang — शुभ रंग (एक रंग का हिंदी नाम, जैसे "हरा", "पीला")।
4. shubh_ank — शुभ अंक (एक या दो अंक, जैसे "7" या "3, 9")।
5. shubh_samay — शुभ समय / मुहूर्त — दिन का कोई एक स्वाभाविक शुभ समय-खंड (जैसे "सुबह 10:30 – 11:15" या "शाम 6:00 – 7:00")। दिन के किसी भी समय का हो सकता है।

नियम:
- ठीक 12 प्रविष्टियाँ, हर राशि के लिए एक, कोई दोहराव नहीं।
- हर राशि का राशिफल अलग और विशिष्ट हो — सब एक जैसे नहीं।
- सिर्फ़ माँगे गए फ़ील्ड लौटाओ; कोई अतिरिक्त टिप्पणी या भूमिका नहीं।`,
  });

  const byKey = new Map<string, HoroscopeEntry>();
  for (const r of object.signs) {
    const key = matchSign(r.sign);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, {
      sign: key,
      forecast: nz((r.forecast ?? "").trim()),
      shubhRang: nz((r.shubh_rang ?? "").trim()),
      shubhAnk: nz((r.shubh_ank ?? "").trim()),
      shubhSamay: nz((r.shubh_samay ?? "").trim()),
    });
  }
  if (byKey.size !== 12) {
    throw new Error(`Horoscope generation returned ${byKey.size}/12 usable signs.`);
  }
  // Return in canonical order, and guard against blank fields.
  return SIGNS.map((s) => {
    const e = byKey.get(s.key)!;
    if (!e.forecast || !e.shubhRang || !e.shubhAnk || !e.shubhSamay) {
      throw new Error(`Horoscope for ${s.key} has empty fields.`);
    }
    return e;
  });
}
