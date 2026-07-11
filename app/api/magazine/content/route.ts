import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { getSession } from "@/lib/auth/session";
import { getModelFor } from "@/lib/ai/provider";
import { getEffectiveDirectives } from "@/lib/ai/directives";
import { MAGAZINE_BY_KEY } from "@/lib/magazines";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/magazine/content — Layer 3: write a full premium article on a chosen
 * topic using the magazine's (editable) content-generation prompt, then run the
 * humanizer pass. Digital-edition users.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const magKey = typeof body?.magazine === "string" ? body.magazine : "";
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const mag = MAGAZINE_BY_KEY[magKey];
  if (!mag) return Response.json({ error: "Unknown magazine" }, { status: 400 });
  if (!topic) return Response.json({ error: "A topic is required." }, { status: 400 });

  const model = await getModelFor("drafting");
  if (!model) return Response.json({ error: "No drafting model configured." }, { status: 503 });
  // Premium long-form Hindi — upgrade to gpt-4.1 when an OpenAI key is present.
  if (process.env.OPENAI_API_KEY) {
    const mm = process.env.STYLE_DRAFT_MODEL ?? "gpt-4.1";
    model.model = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(mm);
    model.modelKey = mm;
    model.providerKey = "openai";
  }

  const directives = await getEffectiveDirectives();
  const contentPrompt = directives.magazineContent?.[magKey];
  if (!contentPrompt) return Response.json({ error: "No content prompt for this magazine." }, { status: 500 });

  const maxOutputTokens = 9000; // ~1000 Hindi words + headroom

  let text = "";
  try {
    const res = await generateText({
      model: model.model,
      system: model.systemPrompt ?? undefined,
      prompt: `${contentPrompt}\n\nटॉपिक: ${topic}`,
      temperature: 0.5,
      maxOutputTokens,
    });
    text = res.text.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed.";
    const rateLimited = /quota|rate.?limit|exhausted|RESOURCE_EXHAUSTED|429/i.test(msg);
    return Response.json(
      { error: rateLimited ? "AI rate limit — wait a few seconds and retry." : `Failed: ${msg.slice(0, 200)}` },
      { status: 503 }
    );
  }

  return Response.json({ body: text, magazine: mag.nameEn });
}
