import { after } from "next/server";
import { z } from "zod";

import { checkApiKey } from "@/lib/translate/config";
import { translateArticle, reviewTranslation } from "@/lib/translate/translate";
import { startLog, finishLog, failLog, appendFlags, recentCount } from "@/lib/translate/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RATE_PER_MINUTE = 60;

const Body = z
  .object({
    title: z.string().max(500).optional().default(""),
    content: z.string().max(150_000).optional().default(""),
    excerpt: z.string().max(3000).optional().default(""),
  })
  .refine((b) => b.title.trim() || b.content.trim() || b.excerpt.trim(), { message: "Send at least one of title, content, excerpt." });

/**
 * POST /api/v1/translate — Hindi → English for WordPress.
 *   Request:  { "title", "content", "excerpt" }  (Hindi; header X-API-Key)
 *   Response: 200 { "title", "content", "excerpt" }  (English, same structure)
 * Translated under the news-accuracy rules; the instant checks' verdict is in
 * the X-Translation-Review header, and the independent AI review runs after
 * the response — everything is logged in Admin → Translations.
 * See deploy/TRANSLATION_API.md.
 */
export async function POST(req: Request) {
  if (!(await checkApiKey(req.headers.get("x-api-key")))) {
    return Response.json({ error: "Invalid or missing X-API-Key." }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".");
    return Response.json({ error: `Invalid request: ${where ? `${where} — ` : ""}${issue?.message ?? "bad body"}` }, { status: 400 });
  }
  const src = parsed.data;

  if ((await recentCount().catch(() => 0)) >= RATE_PER_MINUTE) {
    return Response.json({ error: "Too many requests — retry in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const t0 = Date.now();
  const logId = await startLog(src);
  try {
    const out = await translateArticle(src);
    await finishLog(logId, out.result, out.flags, out.model, Date.now() - t0);
    // Independent AI accuracy review — after the response, so it adds no wait.
    after(async () => {
      try {
        await appendFlags(logId, await reviewTranslation(out.pairs));
      } catch (err) {
        console.error("[translate] review failed", logId, err);
      }
    });
    return Response.json(
      { title: out.result.title, content: out.result.content, excerpt: out.result.excerpt },
      { headers: { "X-Translation-Id": logId ?? "", "X-Translation-Review": out.flags.length ? "needs_review" : "ok" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[translate] failed", logId, msg);
    await failLog(logId, msg, Date.now() - t0);
    return Response.json({ error: "Translation failed — please retry." }, { status: 502 });
  }
}
