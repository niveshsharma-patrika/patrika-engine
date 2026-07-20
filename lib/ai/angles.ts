import { generateObject } from "ai";
import { z } from "zod";

import { getModelFor } from "./provider";
import type { StoryAngle } from "@/lib/data/trends";

/**
 * Generate 2-3 DISTINCT editorial angles for a story by reading its full
 * coverage. No-AI clustering decides WHAT the story is; this is the one place
 * we use a model — to suggest how a newsroom could approach it. Strictly
 * grounded in the supplied coverage (no training-data facts).
 */

export type AngleInput = {
  title: string;
  section?: string | null;
  lang?: "en" | "hi";
  coverage: Array<{ publisher: string; text: string }>;
};

export type AngleResult =
  | {
      angles: StoryAngle[];
      meta: { provider: string; model: string; inputTokens: number; outputTokens: number };
    }
  | { error: string };

const AngleSchema = z.object({
  angles: z
    .array(
      z.object({
        title: z.string().describe("A sharp 6-12 word editorial angle / hook"),
        summary: z
          .string()
          .describe("1-2 sentences: the lens and exactly what to focus on / dig into"),
        format: z
          .string()
          .describe(
            "Suggested story format, e.g. Explainer, Ground report, Analysis, Profile, Timeline, Q&A, Data story"
          ),
      })
    )
    .min(2)
    .max(3),
});

export async function generateStoryAngles(input: AngleInput): Promise<AngleResult> {
  const resolved = await getModelFor("angles");
  if (!resolved) {
    return {
      error:
        "No AI model configured. Set GOOGLE_GENERATIVE_AI_API_KEY (or wire a provider in Admin).",
    };
  }
  if (input.coverage.length === 0) {
    return { error: "No coverage to read — this story has no captured article text yet." };
  }

  const lang = input.lang ?? "en";
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const langDirective =
    lang === "hi"
      ? "Write each angle's title and summary in HINDI (Devanagari script)."
      : "Write each angle's title and summary in ENGLISH.";

  const coverageText = input.coverage
    .map((c, i) => `[${i + 1}] ${c.publisher}: ${c.text}`)
    .join("\n");

  const prompt = `You are a senior editor in an Indian newsroom (Patrika). Below is the FULL coverage of ONE news story from multiple outlets. Propose 2-3 genuinely DISTINCT editorial angles Patrika could take — different lenses (e.g. human impact vs policy vs data vs accountability vs explainer), not the same take reworded.

${langDirective}

HARD RULES:
- Ground every angle strictly in the coverage below. Do NOT add names, dates, numbers, quotes, or context from your training data — even if you "remember" them.
- Today is ${today} (IST). Your training cutoff is irrelevant.
- Each angle must be reportable from THIS coverage (don't propose an angle that needs facts we don't have).
- Make the angles clearly different from one another.

STORY: ${input.title}
SECTION: ${input.section ?? "General"}

COVERAGE (${input.coverage.length} articles — the ONLY facts you may use):
${coverageText}`;

  try {
    const { object, usage } = await generateObject({
      model: resolved.model,
      // Groq's Llama models don't support strict json_schema — use JSON mode.
      providerOptions: { groq: { structuredOutputs: false } },
      schema: AngleSchema,
      system: resolved.systemPrompt ?? undefined,
      prompt,
      temperature: 0.4,
    });

    const angles: StoryAngle[] = object.angles.slice(0, 3).map((a, i) => ({
      id: `a${i + 1}`,
      title: a.title.trim(),
      summary: a.summary.trim(),
      format: a.format.trim(),
    }));

    return {
      angles,
      meta: {
        provider: resolved.providerKey,
        model: resolved.modelKey,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Angle generation failed." };
  }
}
