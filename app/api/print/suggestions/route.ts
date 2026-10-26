import { generateObject } from "ai";
import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getModelFor } from "@/lib/ai/provider";
import { getPrintCities } from "@/lib/print/cities";
import { normalizeHindiTypography as nz } from "@/lib/text/hindi";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * GET /api/print/suggestions?city=&lang= — AI story ideas for the print desk,
 * grounded in what is trending nationally right now + what the print desk's
 * own local sources are carrying (for the chosen city). No fabrication: ideas
 * must come from the supplied headlines.
 */
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const city = (sp.get("city") ?? "").trim();
  const hi = sp.get("lang") !== "en";
  const cities = await getPrintCities();
  const c = cities.find((x) => x.key === city);

  try {
    const [national, local] = await Promise.all([
      pool.query<{ title: string; title_hi: string | null }>(
        `SELECT title, title_hi FROM trends
          WHERE status = 'active' AND publisher_count >= 2 AND last_updated > now() - interval '24 hours'
          ORDER BY last_updated DESC LIMIT 30`
      ),
      pool.query<{ content: string }>(
        `SELECT s.content FROM signals s
           JOIN sources src ON src.id = s.source_id
           JOIN print_cities pc ON pc.key = src.city AND pc.active
          WHERE src.scope = 'print' ${c ? "AND src.city = $1" : ""} AND s.published_at > now() - interval '24 hours'
          ORDER BY s.published_at DESC LIMIT 40`,
        c ? [c.key] : []
      ),
    ]);
    const natTitles = national.rows.map((r) => (hi ? r.title_hi || r.title : r.title)).filter(Boolean);
    const locTitles = [...new Set(local.rows.map((r) => (r.content || "").split(" — ")[0].trim()).filter((t) => t.length > 8))].slice(0, 30);

    const model = (await getModelFor("angles")) ?? (await getModelFor("drafting"));
    if (!model) return Response.json({ error: "No AI model configured." }, { status: 503 });

    const { object } = await generateObject({
      model: model.model,
      temperature: 0.6,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(60_000),
      schema: z.object({
        ideas: z.array(z.object({ headline: z.string(), why: z.string(), category: z.string(), scope: z.string() })),
      }),
      prompt: `You are the planning editor of a ${hi ? "Hindi" : ""} print newspaper desk${c ? ` for the ${c.name_en} (${c.name_hi}) edition` : ""}.
From the headlines below, propose 8 strong print story ideas for today — a mix of local angles and national stories worth localising. ${hi ? "Write everything in Hindi." : "Write in English."}
Each idea: headline (a print-ready headline), why (1–2 sentences: why it matters to our readers + the angle to take), category (one of: crime, politics, courts, business, sports, health, education, civic, world, national), scope ("local" or "national").
Use ONLY the headlines given — no invented events or facts.

NATIONAL (trending now):
${natTitles.map((t) => `- ${t}`).join("\n") || "(none)"}

LOCAL${c ? ` (${c.name_en})` : ""} (from local sources):
${locTitles.map((t) => `- ${t}`).join("\n") || "(none)"}`,
    });

    const ideas = (object.ideas || []).slice(0, 10).map((i) => ({
      headline: nz((i.headline || "").trim()),
      why: nz((i.why || "").trim()),
      category: (i.category || "").trim().toLowerCase(),
      scope: i.scope === "national" ? "national" : "local",
    })).filter((i) => i.headline);
    return Response.json({ ideas, city: c ? { key: c.key, name_en: c.name_en, name_hi: c.name_hi } : null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return Response.json({ error: /quota|rate.?limit|429/i.test(msg) ? "AI rate limit — retry in a moment." : msg.slice(0, 200) }, { status: 503 });
  }
}
