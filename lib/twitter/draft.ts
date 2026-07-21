import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { pool } from "@/lib/db";
import { getApiKey } from "@/lib/ai/provider";

/**
 * Turn a captured tweet into a researched article draft.
 *
 * ISOLATION: writes ONLY to twitter_drafts / tweets. The newsroom `drafts`
 * table is untouched here — a row is created there only when a human clicks
 * "Send to My Articles" (see app/api/twitter/drafts/[id]/promote).
 *
 * EVERY non-retweet tweet is drafted. There is no newsworthiness scoring —
 * the desk's curated account list IS the editorial filter. If research turns
 * up nothing usable, the tweet is marked failed with a reason rather than the
 * model padding it out with invention.
 *
 * The tweet is a TIP-OFF, not the source. 280 characters cannot fill an
 * article; the web research supplies the substance and the tweet supplies the
 * angle. This is deliberately the same web-search grounding already proven in
 * the composer's "write on a topic" path.
 */

// Web-search-grounded generation is slow; callers must allow for it.
export const DRAFT_TIMEOUT_MS = 170_000;

type Settings = {
  auto_draft: boolean;
  daily_cap: number;
  per_account_daily_cap: number;
  per_run_cap: number;
  target_words: number;
};

type PendingTweet = {
  id: string;
  account_id: string;
  tweet_id: string;
  author_handle: string;
  content: string;
  url: string | null;
  posted_at: string;
  language: string;
  display_name: string | null;
  category: string;
};

export type DraftStats = {
  considered: number;
  drafted: number;
  failed: number;
  skipped_reason?: string;
  drafts: Array<{ handle: string; title: string | null; error: string | null }>;
};

/**
 * Strip inline citations / source URLs that web-search models embed.
 * Keeps informative link text (facts and dates live there); drops bare URLs
 * and domain-only citation labels. Mirrors the composer's cleaner — kept as a
 * local copy so the live newsroom route stays untouched.
 */
function stripCitations(text: string): string {
  return text
    .replace(/\(?\s*\[([^\]]*)\]\(https?:\/\/[^)\s]+\)\s*\)?/g, (_m, label: string) => {
      const l = label.trim();
      return /^[\w-]+(\.[\w-]+)+$/.test(l) ? "" : l;
    })
    .replace(/\(\s*https?:\/\/[^)\s]+\s*\)/g, "")
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/【[^】]*】/g, "")
    .replace(/\[\s*\]|\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([।.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getSettings(): Promise<Settings> {
  const { rows } = await pool.query<Settings>(
    `SELECT auto_draft, daily_cap, per_account_daily_cap, per_run_cap, target_words
       FROM twitter_settings WHERE id = true LIMIT 1`
  );
  return (
    rows[0] ?? {
      auto_draft: true, daily_cap: 50, per_account_daily_cap: 20,
      per_run_cap: 5, target_words: 500,
    }
  );
}

/** Articles generated since IST midnight — the cap window. */
async function todayCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM twitter_drafts
      WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
                          AT TIME ZONE 'Asia/Kolkata'`
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Build the prompt. Two rules matter most:
 *  1. Attribute, never assert — a tweet is a claim by a person.
 *  2. Never invent. If research finds nothing, say INSUFFICIENT rather than pad.
 */
function buildPrompt(t: PendingTweet, targetWords: number): string {
  const hi = t.language === "hi";
  const who = t.display_name ? `${t.display_name} (@${t.author_handle})` : `@${t.author_handle}`;

  const langLine = hi
    ? "पूरा लेख हिंदी (देवनागरी) में लिखें।"
    : "Write the entire article in English.";

  return `You are a senior reporter at Patrika, an Indian newspaper. A monitored X (Twitter) account has posted. Research the subject properly and write a publishable news article.

THE POST (this is a TIP-OFF, not your source material):
Account: ${who}  — ${t.category}
Posted: ${t.posted_at}
Text: """${t.content}"""

HOW TO WORK:
1. Use web search to research what this post is actually about. Search the WHOLE web — official statements and government releases, company filings, primary documents, background and context — not only news coverage. News is one input among many.
2. Verify before you write. Establish what is actually true, who the people involved are, what happened before this, and what the real numbers and dates are.
3. Write the article from THAT research. The post is roughly a sentence — it cannot fill an article on its own. The reporting you gather is the article; the post tells you what to report on.

ATTRIBUTION — THE MOST IMPORTANT RULE:
A post is a CLAIM BY A PERSON, never an established fact. ${hi
    ? 'Write "एक्स पर दावा किया गया", "…ने कहा", "…के अनुसार" — never state the claim as fact in Patrika\'s own voice.'
    : 'Write "claimed on X", "said", "according to" — never state the claim as fact in the paper\'s own voice.'}
- If the account announces something official (a government or company account), report it as an announcement BY that body, and say where it was announced.
- If the account alleges or opines, keep it clearly attributed as their allegation or opinion.
- Preserve hedging exactly. Never quietly upgrade an allegation into a fact.

NEVER INVENT:
- Every fact, number, date, name and quote must come from your research or the post itself.
- Do NOT pad to reach the word count. A shorter, accurate article is correct; an invented one is not.
- If research turns up too little to write a real article, reply with exactly INSUFFICIENT and nothing else. Do not guess. Do not write a vague article about the general topic.

STYLE:
- ${langLine}
- Around ${targetWords} words. A hard news article: strongest fact first, then context, background and what happens next.
- Plain newspaper prose. No hype, no editorialising, no rhetorical questions.
- No source links or URLs anywhere in the text. No citation markers.

OUTPUT FORMAT — exactly this, nothing else:
Line 1: TITLE: <the headline>
Then a blank line, then the article body.`;
}

/** Generate one article. Returns null when research was insufficient. */
async function draftOne(
  t: PendingTweet,
  settings: Settings,
  apiKey: string
): Promise<{ title: string; body: string; sources: number; model: string } | null> {
  const openai = createOpenAI({ apiKey });
  const model = process.env.TOPIC_SEARCH_MODEL ?? "gpt-4o";

  const res = await generateText({
    model: openai.responses(model),
    prompt: buildPrompt(t, settings.target_words),
    temperature: 0.3,
    maxOutputTokens: 4000,
    tools: {
      web_search: openai.tools.webSearch({
        searchContextSize: "high",
        userLocation: { type: "approximate", country: "IN" },
      }),
    },
  });

  const raw = (res.text ?? "").trim();
  if (!raw || /^INSUFFICIENT\b/i.test(raw)) return null;

  let title = "";
  let body = raw;
  const m = raw.match(/^\s*TITLE:\s*(.+)$/im);
  if (m) {
    title = m[1].trim().slice(0, 280);
    body = raw.slice(raw.indexOf(m[0]) + m[0].length);
  }

  body = stripCitations(body);
  if (!title) title = body.split("\n")[0].slice(0, 200);
  if (body.trim().length < 200) return null; // too thin to be a real article

  return { title, body, sources: res.sources?.length ?? 0, model };
}

/** Persist a generated article + flip the tweet's status. */
async function saveDraft(
  t: PendingTweet,
  result: { title: string; body: string; sources: number; model: string }
): Promise<string> {
  const words = result.body.trim().split(/\s+/).filter(Boolean).length;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO twitter_drafts (tweet_id, title, body, language, word_count, sources_used, model)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tweet_id) DO UPDATE
        SET title=EXCLUDED.title, body=EXCLUDED.body,
            word_count=EXCLUDED.word_count, sources_used=EXCLUDED.sources_used,
            model=EXCLUDED.model, updated_at=now()
     RETURNING id`,
    [t.id, result.title, result.body, t.language, words, result.sources, result.model]
  );
  await pool.query(
    `UPDATE tweets SET status='drafted', draft_error=NULL, drafted_at=now() WHERE id=$1`,
    [t.id]
  );
  return rows[0].id;
}

async function markFailed(tweetId: string, reason: string): Promise<void> {
  await pool
    .query(
      `UPDATE tweets SET status='failed', draft_error=$2, drafted_at=now() WHERE id=$1`,
      [tweetId, reason.slice(0, 500)]
    )
    .catch(() => {});
}

/**
 * Write an article for ONE specific tweet, on an editor's explicit click.
 *
 * Deliberately accepts ANY tweet regardless of status — including retweets and
 * very short posts. When a human asks for an article on a specific post, that
 * IS the editorial decision; no rule should override it. The automatic path is
 * the one that skips retweets, not this.
 *
 * The daily spend cap still applies, since that is a budget guard rather than
 * an editorial judgement.
 */
export async function draftSingleTweet(
  tweetId: string
): Promise<{ ok: boolean; draftId?: string; title?: string; error?: string }> {
  const settings = await getSettings();

  const apiKey = await getApiKey("openai");
  if (!apiKey) return { ok: false, error: "No OpenAI key configured (Admin → API Keys)." };

  const used = await todayCount();
  if (used >= settings.daily_cap) {
    return { ok: false, error: `Daily cap reached (${used}/${settings.daily_cap}). Raise it in Settings.` };
  }

  const { rows } = await pool.query<PendingTweet>(
    `SELECT t.id, t.account_id, t.tweet_id, t.author_handle, t.content, t.url,
            t.posted_at, a.language, a.display_name, a.category
       FROM tweets t
       JOIN twitter_accounts a ON a.id = t.account_id
      WHERE t.id = $1`,
    [tweetId]
  );
  const tweet = rows[0];
  if (!tweet) return { ok: false, error: "Tweet not found." };

  try {
    const result = await draftOne(tweet, settings, apiKey);
    if (!result) {
      const reason = "Not enough could be verified about this post to write an article.";
      await markFailed(tweet.id, reason);
      return { ok: false, error: reason };
    }
    const draftId = await saveDraft(tweet, result);
    return { ok: true, draftId, title: result.title };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(tweet.id, message);
    console.error(`[twitter] manual draft failed for @${tweet.author_handle}:`, message);
    return { ok: false, error: message.slice(0, 300) };
  }
}

/**
 * Draft articles for tweets awaiting one.
 *
 * Caps are enforced before any AI call so tweet volume can never quietly run
 * up a bill. Over-cap tweets simply stay `new` and get picked up on a later
 * run — nothing is lost.
 */
export async function runTwitterDrafting(
  limitOverride?: number
): Promise<DraftStats> {
  const stats: DraftStats = { considered: 0, drafted: 0, failed: 0, drafts: [] };

  const settings = await getSettings();
  if (!settings.auto_draft && limitOverride === undefined) {
    stats.skipped_reason = "Auto-drafting is switched off in Twitter → Settings.";
    return stats;
  }

  const apiKey = await getApiKey("openai");
  if (!apiKey) {
    stats.skipped_reason = "No OpenAI key configured (Admin → API Keys).";
    return stats;
  }

  const used = await todayCount();
  const remainingToday = Math.max(0, settings.daily_cap - used);
  if (remainingToday === 0) {
    stats.skipped_reason = `Daily cap reached (${used}/${settings.daily_cap}).`;
    return stats;
  }

  const batch = Math.min(limitOverride ?? settings.per_run_cap, remainingToday);

  // Oldest first so a burst doesn't starve earlier tweets. Per-account cap is
  // applied in SQL so one noisy account can't consume the whole daily budget.
  const { rows } = await pool.query<PendingTweet>(
    `SELECT t.id, t.account_id, t.tweet_id, t.author_handle, t.content, t.url,
            t.posted_at, a.language, a.display_name, a.category
       FROM tweets t
       JOIN twitter_accounts a ON a.id = t.account_id
      WHERE t.status = 'new'
        AND (
          SELECT count(*) FROM twitter_drafts d
            JOIN tweets t2 ON t2.id = d.tweet_id
           WHERE t2.account_id = t.account_id
             AND d.created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
                                 AT TIME ZONE 'Asia/Kolkata'
        ) < $1
      ORDER BY t.posted_at ASC
      LIMIT $2`,
    [settings.per_account_daily_cap, batch]
  );

  stats.considered = rows.length;

  // Sequential on purpose: these are long, expensive, rate-limited calls.
  for (const t of rows) {
    try {
      const result = await draftOne(t, settings, apiKey);

      if (!result) {
        await markFailed(
          t.id,
          "Not enough could be verified about this post to write an article."
        );
        stats.failed += 1;
        stats.drafts.push({ handle: t.author_handle, title: null, error: "insufficient research" });
        continue;
      }

      await saveDraft(t, result);

      stats.drafted += 1;
      stats.drafts.push({ handle: t.author_handle, title: result.title, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markFailed(t.id, message);
      stats.failed += 1;
      stats.drafts.push({ handle: t.author_handle, title: null, error: message.slice(0, 200) });
      console.error(`[twitter] drafting failed for @${t.author_handle}:`, message);
    }
  }

  return stats;
}
