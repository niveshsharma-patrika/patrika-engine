import { generateText } from "ai";

import { getSession } from "@/lib/auth/session";
import { getModelFor } from "@/lib/ai/provider";
import { normalizeHindiTypography } from "@/lib/text/hindi";
import { isOlloiDesk, ensureOlloiDisclaimer } from "@/lib/magazines";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/drafts/refine — apply an editor's instruction to an already-generated
 * article with TARGETED edits: change only the parts the instruction affects and
 * keep the rest word-for-word. Fast text transform (no web search), so it stays
 * an interactive "tweak the story" step. No fabrication.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const article = typeof body?.body === "string" ? body.body : "";
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 500) : "";
  const isHi = body?.lang === "hi";
  const magKey = typeof body?.magazine === "string" ? body.magazine.trim() : "";
  if (!article.trim() || !instruction) {
    return Response.json({ error: "Need the article and an instruction." }, { status: 400 });
  }

  const model = await getModelFor("drafting");
  if (!model) return Response.json({ error: "No drafting model configured." }, { status: 503 });

  const langLine = isHi ? "पूरा लेख हिंदी (देवनागरी) में रखो।" : "Keep the whole article in English.";
  const olloi = isOlloiDesk(magKey);
  const olloiNote = olloi
    ? "\n- यह कैंसर-रोगी शिक्षा है: कोई खुराक/निदान/स्टेज/प्रोग्नोसिस या इलाज बदलने की सलाह नहीं; कोई इलाज/चमत्कार/गारंटी का दावा नहीं; अंत का सुरक्षा-डिस्क्लेमर हटाओ मत।"
    : "";

  const prompt = `You are a careful Patrika copy-editor. Apply the editor's instruction to the article below with TARGETED edits — change ONLY the parts the instruction affects and keep everything else WORD-FOR-WORD. Do not rewrite or re-order unrelated sections, do not change the voice, and do not touch facts the instruction doesn't mention.

INSTRUCTION: ${instruction}

RULES:
- Make only the change the instruction asks for; leave the rest of the article exactly as it is.
- Do NOT invent facts, numbers, names, quotes or studies. If the instruction asks to add information you have no real basis for, add general, unattributed guidance rather than fabricating specifics.
- Keep it a clean, flowing article — no meta lines, no "here is the updated version", no note about what you changed.
- ${langLine}${olloiNote}
- Return ONLY the full updated article.

ARTICLE:
${article}`;

  try {
    const res = await generateText({
      model: model.model,
      prompt,
      temperature: 0.4,
      maxOutputTokens: 16000,
    });
    let out = normalizeHindiTypography(res.text.trim());
    if (olloi) {
      out = out.replace(/\s*—\s*/g, ", ").replace(/,\s*,/g, ",");
      // Deterministically guarantee the full safety disclaimer (a refine could
      // shorten or drop the emergency block) — same helper as the generate route.
      out = ensureOlloiDisclaimer(out, isHi);
    }
    return Response.json({ body: out });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message.slice(0, 200) : "Refine failed" },
      { status: 503 }
    );
  }
}
