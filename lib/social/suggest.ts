import { generateObject } from "ai";
import { z } from "zod";

import { pool } from "@/lib/db";
import { getModelFor } from "@/lib/ai/provider";
import { PLATFORM_LABEL } from "./types";
import type { Platform } from "./score";

/**
 * "What to post next" — grounded in what is actually working for the tracked
 * competitors right now, not generic advice. We pull the highest-virality
 * recent posts, summarise them, and ask the model for concrete post ideas for
 * Patrika, each justified by the data it came from.
 */

const SuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      platform: z.enum(["youtube", "x", "instagram", "facebook"]),
      idea: z.string(),        // the post concept / hook
      format: z.string(),      // reel, thread, short, carousel, etc.
      why: z.string(),         // what in the data supports this
      caption: z.string(),     // a ready-to-use caption/hook line
    })
  ).max(8),
});

export type Suggestions = z.infer<typeof SuggestionSchema>["suggestions"];

type TopPost = {
  platform: Platform;
  display_name: string | null;
  handle: string;
  content: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  virality_score: number;
  posted_at: string | null;
};

export async function generateSuggestions(
  days = 7,
  lang: "en" | "hi" = "hi"
): Promise<{ suggestions: Suggestions; basedOn: number; error?: string }> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { rows } = await pool.query<TopPost>(
    `SELECT sp.platform, sa.display_name, sa.handle, sp.content,
            sp.likes, sp.comments, sp.shares, sp.views, sp.virality_score, sp.posted_at
       FROM social_posts sp
       JOIN social_accounts sa ON sa.id = sp.account_id
      WHERE sp.posted_at >= $1
      ORDER BY sp.virality_score DESC, sp.engagement DESC
      LIMIT 30`,
    [cutoff]
  );

  if (rows.length === 0) {
    return { suggestions: [], basedOn: 0, error: "No competitor posts yet — add accounts and sync first." };
  }

  const resolved = await getModelFor("drafting");
  if (!resolved) {
    return { suggestions: [], basedOn: rows.length, error: "No AI model configured." };
  }

  const digest = rows
    .map((r, i) => {
      const eng = r.likes + r.comments + r.shares;
      return `${i + 1}. [${PLATFORM_LABEL[r.platform]}] ${r.display_name ?? r.handle} — virality ${r.virality_score}/100, ${eng.toLocaleString()} interactions${r.views ? `, ${r.views.toLocaleString()} views` : ""}\n   "${(r.content || "").slice(0, 180).replace(/\s+/g, " ")}"`;
    })
    .join("\n");

  const langLine = lang === "hi"
    ? "Write idea/format/why/caption in HINDI (Devanagari)."
    : "Write in English.";

  try {
    const { object } = await generateObject({
      model: resolved.model,
      schema: SuggestionSchema,
      prompt: `You are a social media strategist for Patrika, an Indian news publisher. Below are the highest-performing recent posts from competitor and agency pages we track, with their engagement.

TOP-PERFORMING COMPETITOR POSTS (last ${days} days):
${digest}

Based ONLY on what is actually working above (topics, formats, hooks that earned engagement), propose 5-8 concrete posts Patrika should create next. For each: the platform, the idea/hook, the format (reel / short / thread / carousel / poll…), a one-line "why" pointing at the pattern in the data, and a ready-to-use caption or opening line.

Be specific to the themes in the data — no generic advice. Do not invent engagement numbers. ${langLine}`,
      temperature: 0.7,
    });

    return { suggestions: object.suggestions, basedOn: rows.length };
  } catch (err) {
    return {
      suggestions: [], basedOn: rows.length,
      error: err instanceof Error ? err.message.slice(0, 200) : "suggestion generation failed",
    };
  }
}
