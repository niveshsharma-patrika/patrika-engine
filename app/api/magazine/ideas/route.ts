import { generateStructured } from "@/lib/ai/structured";
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
    const res = await generateStructured({
      model: model.model,
      system: model.systemPrompt ?? undefined,
      // Tolerant: weaker models (Groq) sometimes omit a field. Default missing
      // text to empty and filter out headline-less items below, rather than
      // hard-failing the whole batch on one imperfect idea.
      schema: z.object({
        ideas: z
          .array(
            z.object({
              headline: z.string().default(""),
              subVertical: z.string().default(""),
              hook: z.string().default(""),
              benefit: z.string().default(""),
            })
          )
          .min(1)
          .max(20),
      }),
      prompt,
      temperature: 0.8,
    });
    const ideas = res.object.ideas.filter((i) => i.headline.trim());
    return Response.json({ ideas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed.";
    const rateLimited = /quota|rate.?limit|exhausted|RESOURCE_EXHAUSTED|429/i.test(msg);
    return Response.json(
      { error: rateLimited ? "AI rate limit — wait a few seconds and retry." : `Failed: ${msg.slice(0, 200)}` },
      { status: 503 }
    );
  }
}
