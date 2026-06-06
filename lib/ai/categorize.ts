import { generateObject } from "ai";
import { z } from "zod";

import { getModelFor } from "./provider";
import type { SectionKey } from "@/lib/data/trends";

/**
 * AI categorisation of a finished story into one editorial section. Clustering
 * stays no-AI; this just *labels* the cluster. The lexical keyword classifier
 * (lib/clustering/lexical.ts) is a first-match cascade that mis-tags constantly
 * (NBA→business, North Korea→national, gold crash→world). A model reads the
 * headline in context and gets it right. Batched + run once per story.
 */

// The sections the dashboard filters by. (city/weather collapse into national.)
export const CATEGORY_SECTIONS = [
  "national",
  "world",
  "politics",
  "business",
  "sports",
  "enter",
  "tech",
] as const;

const Schema = z.object({
  items: z.array(
    z.object({
      idx: z.number().int(),
      section: z.enum(CATEGORY_SECTIONS),
    })
  ),
});

const DEFINITIONS = `Sections (pick EXACTLY ONE per headline):
- national: India news — domestic events, crime, accidents, courts, civic issues, government services/welfare, religion, society, human interest, local/city news, education, health, weather. This is the DEFAULT for Indian news that isn't clearly another beat.
- world: international news happening OUTSIDE India — foreign countries, global geopolitics, wars abroad (e.g. North Korea, US politics, Israel-Iran). An India story that merely mentions a foreign country stays "national".
- politics: party politics, elections, parliament/assembly, political leaders' political activity and statements, policy fights between parties.
- business: economy, stock markets (Sensex/Nifty), companies, corporate deals, banking/RBI/SEBI, IPOs, COMMODITIES (gold, silver, oil prices), startup funding, GDP, trade.
- sports: ALL sports — cricket, football, NBA/basketball, tennis, hockey, kabaddi, athletes, matches, tournaments, leagues.
- enter: entertainment — films, music, OTT/streaming, TV, celebrities, reviews, box office.
- tech: technology — gadgets, smartphones, AI, software, apps, startups' products, space, telecom, science/research.

Tie-breakers:
- Gold/silver/oil prices = business (NOT world).
- Horoscopes/astrology, murder, accidents, local crime = national.
- Jammu & Kashmir and anything inside India = national/politics, never world.
- A sport played abroad (NBA, FIFA) is still "sports", not world.`;

export type CatStory = { id: string; title: string };

/**
 * Classify stories into sections. Returns a Map id→section for the ones the
 * model classified; ids it couldn't handle are simply absent (caller keeps the
 * lexical guess). Returns an empty map if no AI model is configured.
 */
export async function classifyStorySections(
  stories: CatStory[]
): Promise<Map<string, SectionKey>> {
  const out = new Map<string, SectionKey>();
  if (stories.length === 0) return out;

  const resolved = await getModelFor("categorize");
  if (!resolved) return out; // no key → caller falls back to lexical

  const BATCH = 25;
  for (let i = 0; i < stories.length; i += BATCH) {
    const chunk = stories.slice(i, i + BATCH);
    const lines = chunk.map((s, j) => `[${j + 1}] ${s.title}`).join("\n");
    try {
      const { object } = await generateObject({
        model: resolved.model,
        schema: Schema,
        temperature: 0,
        prompt: `You are a news desk editor at an Indian newsroom. Classify each headline into one section.

${DEFINITIONS}

Headlines:
${lines}

Return { items: [ { idx, section } ] } covering every headline by its [idx] number.`,
      });
      for (const it of object.items) {
        const story = chunk[it.idx - 1];
        if (story) out.set(story.id, it.section as SectionKey);
      }
    } catch {
      // Skip this batch on error — those stories keep their lexical section.
    }
  }
  return out;
}
