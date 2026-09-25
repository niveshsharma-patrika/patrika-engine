import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { getApiKey, getModelFor } from "@/lib/ai/provider";
import { MAGAZINE_BY_KEY } from "@/lib/magazines";
import { normalizeHindiTypography as nz } from "@/lib/text/hindi";
import { stripCitations } from "@/lib/text/citations";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

/**
 * POST /api/quick-bytes/generate — turn a current-affairs topic (from the ideas
 * step) into a glanceable Quick Byte: a question-style headline + 3–5 cards, each
 * a short title + 2–3 sentences. Grounded on live web search so it reflects what
 * is happening NOW. No fabrication.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const magKey = typeof body?.magazine === "string" ? body.magazine.trim() : "";
  const topic = typeof body?.topic === "string" ? body.topic.trim().slice(0, 300) : "";
  if (!topic) return Response.json({ error: "Need a topic." }, { status: 400 });
  const mag = MAGAZINE_BY_KEY[magKey];
  const deskLine = mag ? ` (डेस्क: ${mag.nameHi})` : "";
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

  // 1. Research the latest verified facts on the topic (best-effort web search).
  let context = "";
  const openaiKey = await getApiKey("openai");
  if (openaiKey) {
    try {
      const openai = createOpenAI({ apiKey: openaiKey });
      const r = await generateText({
        model: openai.responses(process.env.TOPIC_SEARCH_MODEL ?? "gpt-4o"),
        prompt: `Research the LATEST, verified facts on this current-affairs topic and return a concise Hindi digest (6–10 bullet points) of what is happening NOW${deskLine}: names, correct dates, numbers, the current status/outcome as of ${today}. Only recent, verified facts — no speculation, no invented specifics.\n\nTOPIC: ${topic}`,
        temperature: 0.3,
        maxOutputTokens: 900,
        abortSignal: AbortSignal.timeout(80_000),
        tools: {
          web_search: openai.tools.webSearch({ searchContextSize: "high", userLocation: { type: "approximate", country: "IN" } }),
        },
      });
      context = stripCitations((r.text ?? "").trim());
    } catch (e) {
      console.error("Quick Bytes research failed; continuing without it:", e);
    }
  }

  // 2. Structure into a Quick Byte.
  const model = await getModelFor("drafting");
  if (!model) return Response.json({ error: "No drafting model configured." }, { status: 503 });

  try {
    const { object } = await generateObject({
      model: model.model,
      temperature: 0.5,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(60_000),
      schema: z.object({
        headline: z.string(),
        cards: z.array(z.object({ title: z.string(), text: z.string() })),
      }),
      prompt: `तुम राजस्थान पत्रिका के लिए एक "Quick Byte" बना रहे हो — एक झलक में पढ़ी जाने वाली, स्वाइप-कार्ड शैली की खबर।${deskLine}

विषय (करेंट अफेयर्स): ${topic}
${context ? `\nताज़ा तथ्य (इन्हीं पर आधारित रहो — पुरानी/स्मृति-आधारित बातें नहीं):\n${context}\n` : ""}
बनाओ:
- headline: एक आकर्षक, सवाल-नुमा हेडलाइन हिंदी में (जैसे "क्यों बढ़ रही है नौकरी की असुरक्षा?")।
- cards: 3 से 5 कार्ड (सामग्री के अनुसार)। हर कार्ड में:
  • title: एक छोटा सवाल/उप-शीर्षक (जैसे "सरकारें क्या कदम उठा रही हैं?")।
  • text: 2–3 छोटे वाक्य, सरल बोलचाल की हिंदी में, सीधे और ठोस — एक झलक में समझ आ जाए।

नियम:
- सिर्फ़ ताज़ा, सत्यापित तथ्य; कोई मनगढ़ंत आँकड़ा/नाम/तारीख नहीं। जो पुष्ट न हो उसे सामान्य रखो।
- हर कार्ड एक अलग पहलू कवर करे; दोहराव नहीं।
- कम से कम 3 और ज़्यादा से ज़्यादा 5 कार्ड।
- सिर्फ़ माँगे गए फ़ील्ड लौटाओ।`,
    });

    const headline = nz((object.headline ?? "").trim());
    const cards = object.cards
      .slice(0, 5)
      .map((c) => ({ title: nz((c.title ?? "").trim()), text: nz((c.text ?? "").trim()) }))
      .filter((c) => c.title && c.text);
    if (!headline || cards.length < 3) {
      return Response.json({ error: "Could not produce a complete Quick Byte — try again." }, { status: 502 });
    }
    return Response.json({ magazine: magKey, headline, cards, researched: Boolean(context) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed.";
    const rateLimited = /quota|rate.?limit|exhausted|429/i.test(msg);
    return Response.json(
      { error: rateLimited ? "AI rate limit — wait a few seconds and retry." : `Failed: ${msg.slice(0, 200)}` },
      { status: 503 }
    );
  }
}
