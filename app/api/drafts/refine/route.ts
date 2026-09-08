import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { getSession } from "@/lib/auth/session";
import { getModelFor, getApiKey } from "@/lib/ai/provider";
import { normalizeHindiTypography } from "@/lib/text/hindi";
import { stripCitations } from "@/lib/text/citations";
import { isOlloiDesk, ensureOlloiDisclaimer } from "@/lib/magazines";

export const dynamic = "force-dynamic";
// Add-info refine runs a web-search research pass (~30–90s), so allow more time.
export const maxDuration = 185;

/**
 * POST /api/drafts/refine — apply an editor's instruction to an already-generated
 * article.
 *
 * Two modes, chosen from the instruction:
 *  • STYLISTIC edits ("make it shorter", "simpler language", "fix the tone") →
 *    a fast, tool-less text transform: change only the affected parts, no
 *    fabrication.
 *  • ADD-INFO edits ("add a section on X", "add more detail / latest data") →
 *    a RESEARCH-backed pass: web-search the needed facts, then integrate them.
 *    This is what makes "add more info" actually add real, current information
 *    instead of returning the story unchanged.
 */

// Heuristic: does the instruction ask to ADD information (needs a research pass)
// vs. just restyle/trim/remove existing text (fast, tool-less)? A remove/restyle
// verb ALWAYS wins — so "remove the last two examples" or "reword the data
// section" is never sent to the (slow, additive) research path even though it
// names "examples"/"data".
function wantsMoreInfo(instruction: string): boolean {
  const s = instruction.toLowerCase();
  const removeOrStyle =
    /\b(remove|delete|cut|drop|trim|tighten|shorten|shorter|condense|summari[sz]e|reword|rephrase|rewrite|reorder|move|swap|simplif|simpler|clarif|clearer|fix|correct|grammar|spelling|tone|format|headline|title|table|bullet)\b/.test(s) ||
    /(हटा|मिटा|छोटा|संक्षिप्त|संक्षेप|घटा|कम करो|सरल|आसान|ठीक करो|सुधार|व्याकरण|वर्तनी|टोन|शीर्षक|फ़ॉर्मैट|फॉर्मेट|टेबल|बुलेट|दोबारा लिखो|फिर से लिखो|हटाओ)/.test(instruction);
  if (removeOrStyle) return false;
  const addEn =
    /\b(add|include|incorporate|expand|elaborate|append|more|further|additional|latest|recent|up-?to-?date|research|deepen|deeper|background|context|detail|details|example|examples|data|figures|statistics|section)\b/.test(s);
  const addHi =
    /(जोड़|और (जानकारी|बताओ|जोड़|विस्तार)|अधिक|ज़्यादा|ज्यादा|विस्तार|विस्तृत|बढ़ा|शामिल|सेक्शन|हिस्सा|उदाहरण|आंकड़|डेटा|ताज़ा|ताजा|हालिया|अपडेट|गहराई|नई जानकारी|रिसर्च|शोध|पृष्ठभूमि|संदर्भ)/.test(instruction);
  return addEn || addHi;
}

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

  const langLine = isHi ? "पूरा लेख हिंदी (देवनागरी) में रखो।" : "Keep the whole article in English.";
  const olloi = isOlloiDesk(magKey);
  const olloiNote = olloi
    ? "\n- यह कैंसर-रोगी शिक्षा है: कोई खुराक/निदान/स्टेज/प्रोग्नोसिस या इलाज बदलने की सलाह नहीं; कोई इलाज/चमत्कार/गारंटी का दावा नहीं; अंत का सुरक्षा-डिस्क्लेमर हटाओ मत।"
    : "";

  // Finalize: Hindi typography, Olloi de-dash + guaranteed disclaimer.
  const finalize = (text: string): string => {
    let out = normalizeHindiTypography(text.trim());
    if (olloi) {
      out = out.replace(/\s*—\s*/g, ", ").replace(/,\s*,/g, ",");
      out = ensureOlloiDisclaimer(out, isHi);
    }
    return out;
  };

  // ── ADD-INFO path: research real facts with web search, then integrate ─────
  const needsInfo = wantsMoreInfo(instruction);
  const openaiKey = needsInfo ? await getApiKey("openai") : null;
  if (needsInfo && openaiKey) {
    try {
      const openai = createOpenAI({ apiKey: openaiKey });
      const today = new Date().toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
      });
      const prompt = `You are a senior Patrika journalist updating an EXISTING article per the editor's instruction, which asks you to ADD information. FIRST research the needed facts with web search (verify names, dates, figures, and the CURRENT status as of ${today}); THEN integrate them into the article.

INSTRUCTION: ${instruction}

RULES:
- Do what the instruction asks by ADDING real, verified, up-to-date information (a new section, paragraph, examples, data, or the latest developments — as asked). Keep the rest of the article's facts, structure and voice intact; do NOT rewrite or reorder unrelated parts.
- Use ONLY real, corroborated facts from your web search. NEVER invent an expert, quote, statistic, study, institution, name or date. If you cannot verify something, write it as plain general guidance or leave it out — accuracy beats specificity.
- Do NOT repeat facts the article already states; every added sentence must bring genuinely NEW information.
- Weave new material in naturally: no meta lines ("here is the updated version", "I have added…"), no source URLs in the text, no news-outlet names.
- ${langLine}${olloiNote}
- Return ONLY the full updated article — nothing else.

ARTICLE:
${article}`;
      const res = await generateText({
        model: openai.responses(process.env.TOPIC_SEARCH_MODEL ?? "gpt-4o"),
        prompt,
        temperature: 0.3,
        maxOutputTokens: 16000,
        abortSignal: AbortSignal.timeout(150_000),
        tools: {
          web_search: openai.tools.webSearch({
            searchContextSize: "high",
            userLocation: { type: "approximate", country: "IN" },
          }),
        },
      });
      const out = finalize(stripCitations(res.text));
      if (out.trim()) return Response.json({ body: out });
      // Empty result — fall through to the fast transform below.
    } catch (err) {
      // A timeout is worth telling the editor about (a retry usually succeeds).
      // Any OTHER transient error (rate limit, 5xx) falls through to the fast
      // transform, so an add-info request still gets a result rather than a hard
      // failure — matching the pre-research behavior for this input class.
      if (err instanceof Error && /abort|timeout/i.test(err.message)) {
        return Response.json(
          { error: isHi ? "जानकारी जोड़ने में समय लग गया — दोबारा कोशिश करें।" : "Adding researched info timed out — please try again." },
          { status: 503 }
        );
      }
      console.error("Refine research pass failed; falling back to fast transform:", err);
    }
  }

  // ── STYLISTIC path (or no OpenAI key): fast, tool-less targeted edit ────────
  const model = await getModelFor("drafting");
  if (!model) return Response.json({ error: "No drafting model configured." }, { status: 503 });

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
    return Response.json({ body: finalize(res.text) });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message.slice(0, 200) : "Refine failed" },
      { status: 503 }
    );
  }
}
