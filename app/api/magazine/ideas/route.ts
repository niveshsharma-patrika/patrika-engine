import { generateObject } from "ai";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { getModelFor } from "@/lib/ai/provider";
import { getEffectiveDirectives } from "@/lib/ai/directives";
import { MAGAZINE_BY_KEY } from "@/lib/magazines";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/magazine/ideas — Layer 1: generate a batch of fresh topic ideas for
 * a magazine from its (editable) idea-generation prompt. Digital-edition users.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const magKey = typeof body?.magazine === "string" ? body.magazine : "";
  const mag = MAGAZINE_BY_KEY[magKey];
  if (!mag) return Response.json({ error: "Unknown magazine" }, { status: 400 });

  const model = await getModelFor("drafting");
  if (!model) return Response.json({ error: "No drafting model configured." }, { status: 503 });

  const directives = await getEffectiveDirectives();
  const prompt = directives.magazineIdea?.[magKey];
  if (!prompt) return Response.json({ error: "No idea prompt for this magazine." }, { status: 500 });

  try {
    const res = await generateObject({
      model: model.model,
      // Groq's Llama models don't support strict json_schema — use JSON mode.
      providerOptions: { groq: { structuredOutputs: false } },
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
      prompt: `${prompt}\n\nRespond with valid JSON.`,
      temperature: 0.8,
    });
    return Response.json({ ideas: res.object.ideas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed.";
    const rateLimited = /quota|rate.?limit|exhausted|RESOURCE_EXHAUSTED|429/i.test(msg);
    return Response.json(
      { error: rateLimited ? "AI rate limit — wait a few seconds and retry." : `Failed: ${msg.slice(0, 200)}` },
      { status: 503 }
    );
  }
}
