import { generateObject } from "ai";
import { z } from "zod";

import { pool } from "@/lib/db";
import { getModelFor } from "@/lib/ai/provider";
import { searchGoogleNews } from "@/lib/sources/google-news";
import { isTrustedPublisherName } from "@/lib/sources/trusted";
import { createAdminClient } from "@/lib/supabase/server";
import type { CreativePack } from "./trend-types";

export type Corroboration = { title: string; source: string; url: string; date: string };

/**
 * Turn one social trend into a ready-to-post creative pack for Patrika.
 *
 * A social trend is USER-GENERATED and may be rumour, satire or
 * misinformation. The prompt therefore treats it as "a topic circulating on
 * social", never as established fact, produces an attributed Patrika angle, and
 * always returns a `caution` line telling the desk what to verify. Editors
 * still review before anything is published.
 */
const Schema = z.object({
  angle: z.string(),
  x: z.string(),
  instagram: z.string(),
  facebook: z.string(),
  youtube_title: z.string(),
  hashtags: z.array(z.string()).max(12),
  image_concept: z.string(),
  caution: z.string(),
});

type TrendRow = {
  id: string;
  platform: string;
  title: string;
  body: string;
  origin: string | null;
  author: string | null;
  score: number;
  comments: number;
  url: string | null;
  permalink: string | null;
};

export async function generateCreative(
  trendId: string,
  lang: "en" | "hi" = "hi"
): Promise<{ ok: boolean; pack?: CreativePack; corroboration?: Corroboration[]; error?: string }> {
  const { rows } = await pool.query<TrendRow>(
    `SELECT id, platform, title, body, origin, author, score, comments, url, permalink
       FROM social_trend_items WHERE id = $1`,
    [trendId]
  );
  const trend = rows[0];
  if (!trend) return { ok: false, error: "Trend not found." };

  const resolved = await getModelFor("drafting");
  if (!resolved) return { ok: false, error: "No AI model configured (Admin → API Keys)." };

  // Cross-check the social trend against REAL news coverage from trusted outlets.
  // This grounds the angle AND — the key value — tells the desk whether credible
  // media is actually reporting this, or it is an unverified social rumour.
  let corroboration: Corroboration[] = [];
  try {
    const hits = await searchGoogleNews(trend.title.slice(0, 200), lang, 8);
    corroboration = hits
      .filter((h) => isTrustedPublisherName(h.source))
      .slice(0, 5)
      .map((h) => ({ title: h.title, source: h.source, url: h.url, date: h.publishedAt }));
  } catch {
    /* best-effort — a failed cross-check just yields no corroboration */
  }
  const crossCheckBlock = corroboration.length
    ? `\n\nNEWS CROSS-CHECK — credible outlets ARE reporting related news. Use these to ground the angle and keep every fact accurate; do NOT contradict them:\n${corroboration
        .map((c, i) => `[${i + 1}] ${c.title}`)
        .join("\n")}`
    : `\n\nNEWS CROSS-CHECK — NO credible mainstream outlet was found reporting this. Treat it as UNVERIFIED / possibly rumour or satire: keep the copy cautious and questioning (attribute to "social media", never state as fact), and make the caution line explicitly say this needs verification before posting.`;

  const langLine =
    lang === "hi"
      ? "Write ALL copy (angle, x, instagram, facebook, youtube_title, caution) in HINDI (Devanagari). Hashtags may be English or Hindi."
      : "Write all copy in English.";

  const src = trend.platform === "reddit" ? `Reddit (r/${trend.origin})` : `X (search: ${trend.origin})`;

  try {
    const { object } = await generateObject({
      model: resolved.model,
      schema: Schema,
      prompt: `You are the social media editor at Patrika, an Indian news publisher. A topic is trending on social media and we want to post about it across our channels.

TRENDING ITEM (source: ${src}, ${trend.score.toLocaleString()} upvotes/likes, ${trend.comments} comments):
"""
${trend.title}
${trend.body}
"""${crossCheckBlock}

Produce a social creative pack for Patrika:
- angle: the specific news angle Patrika should take on this (one sentence).
- x: a tweet (max 280 chars incl. hashtags), punchy, Patrika voice.
- instagram: a caption with a strong first-line hook, then 1-2 lines, then hashtags.
- facebook: a slightly longer post (2-3 sentences).
- youtube_title: a compelling title if this became a video/short.
- hashtags: 5-10 relevant, high-reach hashtags (mix broad + specific).
- image_concept: describe ONE strong visual for the post (no text baked in).
- caution: what the desk must VERIFY before publishing, and any sensitivity.

RULES:
- This trend is user-generated content — treat it as "a topic circulating online", NEVER as confirmed fact. Do not state unverified claims as fact. If it looks like rumour/satire, say so in caution.
- No made-up statistics, names, dates or quotes. Keep hedging language.
- Neutral and factual on religion / politics / communal / tragic topics. Dignified, no sensationalism.
- ${langLine}`,
      temperature: 0.7,
      maxOutputTokens: 1500,
    });

    // Persist so re-opening the trend shows the pack + its news cross-check.
    await pool.query(
      `UPDATE social_trend_items SET generated = $2::jsonb, generated_at = now() WHERE id = $1`,
      [trendId, JSON.stringify({ ...object, corroboration })]
    );

    return { ok: true, pack: object, corroboration };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "generation failed" };
  }
}

type NewsSignal = { author: string | null; content: string | null; url: string | null; sources?: { name: string | null } | null };
type NewsTrendRow = { title: string; title_hi: string | null; desk: string | null; suggested_angle: string | null; signals?: NewsSignal[] };

/**
 * Make a social creative pack from a CONFIRMED NEWS trend (the dashboard's
 * clustered stories), not a social rumour. Because a news trend requires 3+
 * publishers to exist, it is already corroborated — its own publisher signals
 * ARE the cross-check, and the copy can be confident (no "unverified" hedging).
 */
export async function generateNewsCreative(
  newsTrendId: string,
  lang: "en" | "hi" = "hi"
): Promise<{ ok: boolean; pack?: CreativePack; corroboration?: Corroboration[]; error?: string }> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "Database not configured." };
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("trends")
    .select(`title, title_hi, desk, suggested_angle, signals ( author, content, url, sources ( name ) )`)
    .eq("id", newsTrendId)
    .maybeSingle();
  const trend = data as NewsTrendRow | null;
  if (!trend) return { ok: false, error: "News story not found." };

  const resolved = await getModelFor("drafting");
  if (!resolved) return { ok: false, error: "No AI model configured (Admin → API Keys)." };

  const title = (lang === "hi" && trend.title_hi) ? trend.title_hi : trend.title;
  const signals = (trend.signals ?? []).filter((s) => (s.content ?? "").trim());
  const corroboration: Corroboration[] = signals.slice(0, 5).map((s) => ({
    title: (s.content ?? "").split(" — ")[0].trim().slice(0, 120),
    source: s.sources?.name ?? s.author ?? "News",
    url: s.url ?? "",
    date: "",
  }));
  const reportBlock = signals.slice(0, 6).map((s) => `• ${(s.content ?? "").trim()}`).join("\n");

  const langLine =
    lang === "hi"
      ? "Write ALL copy (angle, x, instagram, facebook, youtube_title, caution) in HINDI (Devanagari). Hashtags may be English or Hindi."
      : "Write all copy in English.";

  try {
    const { object } = await generateObject({
      model: resolved.model,
      schema: Schema,
      prompt: `You are the social media editor at Patrika, an Indian news publisher. Below is a CONFIRMED news story Patrika is covering — reported by ${signals.length} outlets, so it is established news, NOT a rumour. Produce a social creative pack to post it across our channels.

NEWS STORY: ${title}${trend.suggested_angle ? `\nSuggested angle: ${trend.suggested_angle}` : ""}
What the reporting says:
"""
${reportBlock}
"""

Produce a social creative pack for Patrika:
- angle: the specific news angle for the post (one sentence).
- x: a tweet (max 280 chars incl. hashtags), punchy, Patrika voice.
- instagram: a caption with a strong first-line hook, then 1-2 lines, then hashtags.
- facebook: a slightly longer post (2-3 sentences).
- youtube_title: a compelling title if this became a video/short.
- hashtags: 5-10 relevant, high-reach hashtags (mix broad + specific).
- image_concept: describe ONE strong visual for the post (no text baked in).
- caution: anything sensitive to handle with care — but this is CONFIRMED news, so keep it light (no "unverified" hedging).

RULES:
- Attribute facts to the people / institutions IN the story (police, officials, the company), NEVER to the outlets that reported it, and do not name any outlet in the copy.
- No made-up statistics, names, dates or quotes beyond the reporting above.
- Neutral and factual on religion / politics / communal / tragic topics. Dignified, no sensationalism.
- ${langLine}`,
      temperature: 0.7,
      maxOutputTokens: 1500,
    });
    return { ok: true, pack: object, corroboration };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "generation failed" };
  }
}
