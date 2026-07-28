import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { getModelFor, getApiKey } from "@/lib/ai/provider";
import { getEffectiveDirectives } from "@/lib/ai/directives";
import { MAGAZINE_BY_KEY } from "@/lib/magazines";

export const dynamic = "force-dynamic";
export const maxDuration = 160;

/**
 * POST /api/magazine/ideas — Layer 1: generate a batch of fresh topic ideas for
 * a magazine from its (editable) idea-generation prompt.
 *
 * Now web-search grounded: when an OpenAI key is present, we first research
 * CURRENT, relevant context (optionally steered by a desk filter — e.g. current
 * political topics, "on this day", a politician in the news) and feed that into
 * the idea generation, so ideas are timely and specific rather than generic.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const magKey = typeof body?.magazine === "string" ? body.magazine : "";
  const filterKey = typeof body?.filter === "string" ? body.filter : "";
  const mag = MAGAZINE_BY_KEY[magKey];
  if (!mag) return Response.json({ error: "Unknown magazine" }, { status: 400 });

  const filter = mag.filters?.find((f) => f.key === filterKey);

  const model = await getModelFor("drafting");
  if (!model) return Response.json({ error: "No drafting model configured." }, { status: 503 });

  const directives = await getEffectiveDirectives();
  const basePrompt = directives.magazineIdea?.[magKey];
  if (!basePrompt) return Response.json({ error: "No idea prompt for this magazine." }, { status: 500 });

  // Today's date (IST) — used by the "on this day" style filter.
  const istToday = new Date().toLocaleDateString("hi-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "long",
  });

  // ── Web-search research step (best-effort) ──────────────────────────
  // Gathers timely, specific context so the ideas aren't generic.
  let currentContext = "";
  const openaiKey = await getApiKey("openai");
  if (openaiKey) {
    let query: string;
    if (filter?.key === "current") {
      query = `भारत में इस समय चर्चा में चल रहे प्रमुख राजनीतिक मुद्दे, बहसें और ताज़ा घटनाक्रम — नाम, तारीख और ठोस विवरण के साथ।`;
    } else if (filter?.key === "this-day") {
      query = `आज ${istToday} — "इतिहास में आज" — इस तारीख से जुड़ी भारतीय राजनीति, सत्ता और शासन की उल्लेखनीय ऐतिहासिक घटनाएँ (वर्ष व विवरण के साथ)।`;
    } else if (filter?.key === "profile") {
      query = `अभी भारत की सुर्खियों और चर्चा में मौजूद नेता कौन हैं और क्यों — हालिया घटनाक्रम, नाम और संदर्भ।`;
    } else if (filter?.key === "govt-history") {
      query = `भारत की विभिन्न सरकारों/शासनकालों की उल्लेखनीय ऐतिहासिक कहानियाँ — बड़े फैसले, उपलब्धियाँ और विवाद (तथ्यों के साथ)।`;
    } else {
      query = `"${mag.nameHi}" (${mag.reader}) के लिए अभी प्रासंगिक ताज़ा जानकारी, ट्रेंड और घटनाक्रम — ठोस, हालिया और भारत-केंद्रित।`;
    }

    try {
      const openai = createOpenAI({ apiKey: openaiKey });
      const research = await generateText({
        model: openai.responses(process.env.TOPIC_SEARCH_MODEL ?? "gpt-4o"),
        prompt: `Research with web search and return a CONCISE digest (8–12 bullet points, in Hindi) of timely, SPECIFIC, verified facts for this brief. Include names, dates, numbers and concrete specifics — no vague statements, no invented facts.\n\nBRIEF: ${query}`,
        temperature: 0.3,
        maxOutputTokens: 1200,
        tools: {
          web_search: openai.tools.webSearch({
            searchContextSize: "high",
            userLocation: { type: "approximate", country: "IN" },
          }),
        },
      });
      currentContext = (research.text ?? "").trim();
    } catch (e) {
      console.error("Ideas research step failed; continuing without it:", e);
    }
  }

  // ── Build the final idea prompt ─────────────────────────────────────
  const filterBlock = filter
    ? `\n\nचुना गया एंगल/फ़िल्टर: "${filter.label}"\nसभी आइडिया इसी एंगल के होने चाहिए — ${filter.brief}`
    : "";
  const contextBlock = currentContext
    ? `\n\nवर्तमान संदर्भ (इन ताज़ा, ठोस तथ्यों पर आधारित समयोचित आइडिया बनाओ — इनमें से जो प्रासंगिक हो उसका उपयोग करो):\n${currentContext}`
    : "";
  const prompt = `${basePrompt}${filterBlock}${contextBlock}`;

  try {
    const res = await generateObject({
      model: model.model,
      system: model.systemPrompt ?? undefined,
      schema: z.object({
        ideas: z
          .array(
            z.object({
              headline: z.string(),
              subVertical: z.string(),
              hook: z.string(),
              benefit: z.string(),
            })
          )
          .min(6)
          .max(20),
      }),
      prompt,
      temperature: 0.8,
    });
    return Response.json({ ideas: res.object.ideas, researched: Boolean(currentContext) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed.";
    const rateLimited = /quota|rate.?limit|exhausted|RESOURCE_EXHAUSTED|429/i.test(msg);
    return Response.json(
      { error: rateLimited ? "AI rate limit — wait a few seconds and retry." : `Failed: ${msg.slice(0, 200)}` },
      { status: 503 }
    );
  }
}
