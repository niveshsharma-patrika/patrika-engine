import { z } from "zod";

/**
 * Per-post SCORECARD for the Social Center.
 *
 * Design principle (from the design panel): keep the two kinds of number
 * structurally apart.
 *   • REAL source counts (score / comments / publishers / age) are shown raw.
 *   • DETERMINISTIC transforms of them are the "LIVE" momentum.
 *   • The model's opinions about the COPY get ordinal words + a confidence
 *     ceiling — and are NEVER printed with a decimal or a percent sign.
 *
 * So the model returns only a copy-appraisal object (`ScorecardAi`); everything
 * that drives the queue (momentum, priority, verdict, risk floor, timing) is
 * computed here in TypeScript from real signal. "Expected CTR %" is deliberately
 * absent — a manufactured percentage was the worst honesty failure in the draft.
 */
export const ScorecardAiSchema = z.object({
  // Ratings of the COPY WE WROTE (0-100 each). Blended in TS, never shown raw.
  content: z.object({
    hook_strength: z.number().min(0).max(100),
    shareability: z.number().min(0).max(100),
    emotional_pull: z.number().min(0).max(100),
    clarity: z.number().min(0).max(100),
  }),
  // How inviting this copy is vs a typical Patrika post (ordinal — not a %).
  click_appeal: z.enum(["below_average", "average", "strong", "exceptional"]),
  emotional_driver: z.enum([
    "curiosity", "outrage", "inspiration", "utility", "awe", "humor", "fear", "pride",
  ]),
  best_platform: z.object({
    pick: z.enum(["x", "ig", "fb", "yt"]),
    why: z.string(),
  }),
  recommended_format: z.enum(["reel", "carousel", "static", "thread", "short", "long"]),
  recommended_language: z.enum(["hindi", "english", "both"]),
  shelf_life: z.enum(["perishable", "short", "evergreen"]),
  risk: z.object({
    level: z.enum(["low", "elevated", "high"]),
    reason: z.enum(["communal", "legal_defamation", "unverified", "sensitive", "none"]),
  }),
  target_audience: z.string(),
  confidence: z.enum(["low", "med", "high"]),
});
export type ScorecardAi = z.infer<typeof ScorecardAiSchema>;

/** Real-signal inputs — either a social item (A) or a news trend (B). */
export type LiveInput =
  | {
      kind: "A";
      score: number;
      comments: number;
      ageHours: number;
      p95Velocity: number;      // batch p95 of score/age, kills subreddit-size skew
      upvoteRatio?: number | null;
    }
  | {
      kind: "B";
      publisherCount: number;
      hoursSinceUpdate: number;
    };

export type Verdict = "SKIP" | "MAYBE" | "POST NOW" | "QUEUE" | "REVIEW";
export type Level = "low" | "elevated" | "high";
export type Confidence = "low" | "med" | "high";

/** The full computed scorecard the UI renders and we persist. */
export type Metrics = {
  source: "A" | "B";
  priority_score: number;        // 0-100 headline (planning estimate)
  tier: number;                  // 1-5
  verdict: Verdict;
  color: "red" | "amber" | "green";
  momentum: number;              // 0-100 (LIVE, deterministic)
  momentum_kind: "live_buzz" | "confirmation";
  momentum_part: number;         // 0.55*momentum — solid segment of split bar
  content: number;               // 0-100 (AI copy blend)
  content_part: number;          // 0.45*content — hatched segment of split bar
  content_weakest: { key: string; value: number };
  click_appeal: ScorecardAi["click_appeal"];
  emotional_driver: ScorecardAi["emotional_driver"];
  best_platform: { pick: "x" | "ig" | "fb" | "yt"; why: string };
  recommended_format: ScorecardAi["recommended_format"];
  recommended_language: ScorecardAi["recommended_language"];
  shelf_life: ScorecardAi["shelf_life"];
  best_time_ist: string;         // window string, or "Now" when perishable
  perishable_now: boolean;
  risk: { level: Level; reason: ScorecardAi["risk"]["reason"] };
  target_audience: string;
  confidence: Confidence;
  freshness_line: string;        // raw source counts, verbatim
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const SEV: Record<Level, number> = { low: 0, elevated: 1, high: 2 };
const LEVELS: Level[] = ["low", "elevated", "high"];
const CONF: Record<Confidence, number> = { low: 0, med: 1, high: 2 };
const CONFS: Confidence[] = ["low", "med", "high"];

/** Typical good posting windows per platform (India audience), IST. Static,
 * deterministic — the model can't know per-topic timing so we never ask it. */
const TIME_TABLE: Record<string, string> = {
  x: "8–10 AM / 6–9 PM IST",
  ig: "12–1 PM / 8–10 PM IST",
  fb: "1–3 PM / 7–9 PM IST",
  yt: "5–9 PM IST",
};

function fmt(n: number): string {
  if (n >= 10000) return Math.round(n / 1000) + "K";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

/** Combine the real-signal inputs and the AI copy-appraisal into one scorecard. */
export function buildMetrics(ai: ScorecardAi, live: LiveInput): Metrics {
  const c = ai.content;
  const content = 0.35 * c.hook_strength + 0.3 * c.shareability + 0.2 * c.emotional_pull + 0.15 * c.clarity;

  let momentum: number;
  let momentum_kind: Metrics["momentum_kind"];
  let freshness_line: string;
  let riskPre: Level = "low";
  let confCap: Confidence;

  if (live.kind === "A") {
    const ageH = Math.max(live.ageHours, 0);
    // Floor the score: downvoted Reddit posts have NEGATIVE net scores, which
    // would make log10(1+velocity) NaN and silently produce a green verdict.
    const velocity = Math.max(live.score, 0) / Math.max(ageH, 1);
    const p95 = Math.max(live.p95Velocity, 1);
    const velNorm = clamp(Math.log10(1 + velocity) / Math.log10(1 + p95), 0, 1);
    const ratio = live.comments / Math.max(live.score, 1);
    const discussion = clamp(ratio / 0.3, 0, 1);
    const decay = Math.pow(0.5, ageH / 9); // ~9h social half-life
    momentum = 100 * (0.7 * velNorm + 0.3 * discussion) * decay;
    momentum_kind = "live_buzz";
    freshness_line = `${fmt(live.score)} score · ${fmt(live.comments)} comments · ${Math.round(ageH)}h old`;
    // Controversy pre-signal: divisive posts draw many comments per upvote.
    const lowApproval = live.upvoteRatio != null && live.upvoteRatio < 0.6;
    riskPre = (lowApproval && ratio > 0.3) || (live.upvoteRatio == null && ratio > 0.5) ? "elevated" : "low";
    confCap = decay < 0.25 || live.score < 20 ? "low" : "high";
  } else {
    const hrs = Math.max(live.hoursSinceUpdate, 0);
    const confirm = clamp(live.publisherCount / 8, 0, 1); // 3=floor, saturates ~8
    const decay = Math.pow(0.5, hrs / 12); // ~12h news half-life
    momentum = 100 * (0.5 + 0.5 * confirm) * decay;
    momentum_kind = "confirmation";
    const mins = Math.round(hrs * 60);
    const updated = mins < 90 ? `${mins}m` : `${Math.round(hrs)}h`;
    freshness_line = `${live.publisherCount} publishers · updated ${updated} ago`;
    confCap = "med"; // no social behaviour data — cap confidence at medium
  }

  if (!Number.isFinite(momentum)) momentum = 0; // belt-and-suspenders: never let NaN drive the verdict
  momentum = clamp(Math.round(momentum), 0, 100);
  const momentum_part = Math.round(0.55 * momentum);
  const content_part = Math.round(0.45 * content);
  const priority_score = clamp(momentum_part + content_part, 0, 100);
  const tier = clamp(Math.ceil(priority_score / 20) || 1, 1, 5);

  const riskLevel = LEVELS[Math.max(SEV[riskPre], SEV[ai.risk.level])];

  let verdict: Verdict;
  if (riskLevel === "high") verdict = "REVIEW";
  else if (priority_score < 40) verdict = "SKIP";
  else if (priority_score < 65) verdict = "MAYBE";
  else verdict = ai.shelf_life === "perishable" ? "POST NOW" : "QUEUE";

  const color: Metrics["color"] =
    riskLevel === "high" || priority_score < 40 ? "red" : priority_score < 65 ? "amber" : "green";

  const confidence = CONFS[Math.min(CONF[ai.confidence], CONF[confCap])];

  const weakest = (Object.entries(c) as [string, number][]).sort((a, b) => a[1] - b[1])[0];
  const content_weakest = { key: weakest[0], value: Math.round(weakest[1]) };

  const perishable_now = ai.shelf_life === "perishable";
  const best_time_ist = perishable_now ? "Now" : TIME_TABLE[ai.best_platform.pick] ?? "7–9 PM IST";

  return {
    source: live.kind,
    priority_score, tier, verdict, color,
    momentum, momentum_kind, momentum_part,
    content: Math.round(content), content_part,
    content_weakest,
    click_appeal: ai.click_appeal,
    emotional_driver: ai.emotional_driver,
    best_platform: ai.best_platform,
    recommended_format: ai.recommended_format,
    recommended_language: ai.recommended_language,
    shelf_life: ai.shelf_life,
    best_time_ist, perishable_now,
    risk: { level: riskLevel, reason: ai.risk.reason },
    target_audience: ai.target_audience,
    confidence,
    freshness_line,
  };
}

/** Instruction block appended to the pack-generation prompt. */
export const SCORECARD_PROMPT = `
Also fill "scorecard" — a quick EDITORIAL PLANNING read of the POST YOU JUST WROTE (rate the copy, not the topic):
- content: rate the COPY 0-100 on hook_strength (does the first line stop the scroll), shareability, emotional_pull, clarity.
- click_appeal: how inviting is this copy vs a typical Patrika post — below_average | average | strong | exceptional.
- emotional_driver: the main lever the copy pulls.
- best_platform: { pick (x|ig|fb|yt), why } — the ONE channel this will do best on + a one-line reason.
- recommended_format: best format for that platform (reel|carousel|static|thread|short|long).
- recommended_language: hindi | english | both, for the widest Indian reach.
- shelf_life: perishable (loses value within a day) | short | evergreen.
- risk: { level (low|elevated|high), reason (communal|legal_defamation|unverified|sensitive|none) } — brand-safety for a news masthead. Keep level low UNLESS the topic is genuinely communal / defamation-prone / unverified / sensitive.
- target_audience: one short phrase (e.g. "urban Hindi readers 18-34").
- confidence: your honest confidence in these estimates (low|med|high).`;
