import {
  generateObject,
  generateText,
  type LanguageModel,
  type LanguageModelUsage,
} from "ai";
import type { z } from "zod";

type Args<T> = {
  model: LanguageModel;
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

/**
 * Structured generation that survives weaker models.
 *
 * Primary path: `generateObject` — strict `json_schema` on OpenAI/Google/
 * Anthropic; JSON mode on Groq (whose Llama models reject json_schema).
 *
 * Fallback: Groq's Llama sometimes returns JSON that doesn't validate against
 * the schema ("response did not match schema"). When that happens we retry as
 * plain text, extract the JSON object/array, and validate it ourselves.
 *
 * Returns `{ object, usage }` like `generateObject`, so it's a drop-in.
 */
export async function generateStructured<T>(
  args: Args<T>
): Promise<{ object: T; usage: LanguageModelUsage | undefined }> {
  const { model, schema, system, temperature } = args;
  const maxOutputTokens = args.maxOutputTokens ?? 4000;
  const prompt = `${args.prompt}\n\nRespond with ONLY one valid JSON object matching the required structure — no markdown fences, no commentary.`;

  try {
    const r = await generateObject({
      model,
      schema,
      system,
      prompt,
      temperature,
      maxOutputTokens,
      // Groq's Llama models don't support strict json_schema — use JSON mode.
      providerOptions: { groq: { structuredOutputs: false } },
    });
    return { object: r.object, usage: r.usage };
  } catch {
    const r = await generateText({ model, system, prompt, temperature, maxOutputTokens });
    return { object: schema.parse(extractJson(r.text)), usage: r.usage };
  }
}

/** Pull the outermost JSON object/array out of a text response. */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = cleaned.search(/[[{]/);
  const last = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  const slice = first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned;
  return JSON.parse(slice);
}
