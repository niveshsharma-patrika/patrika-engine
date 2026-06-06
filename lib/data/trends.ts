/**
 * Trend types and section color tokens.
 * Mock data deliberately empty — UI shows an empty state until live ingest fills it.
 */

export type SectionKey =
  | "city"
  | "business"
  | "sports"
  | "politics"
  | "weather"
  | "enter"
  | "tech"
  | "national"
  | "world";

export type SourceKey = "x" | "rss" | "gn";

/** An AI-proposed editorial angle for a story (generated on demand, saved). */
export type StoryAngle = {
  id: string;
  title: string; // the hook / angle headline
  summary: string; // 1-2 sentences: the lens + what to focus on
  format: string; // suggested story format (Explainer / Ground report / Analysis / …)
};

export type Trend = {
  id: number | string;
  // The real DB row id (uuid) for live stories — used by the AI endpoints
  // (angles + draft) to target the right row. Absent for mock / newswire cards.
  uid?: string;
  section: SectionKey;
  tag: string;
  title: string;
  velocityPct: number;
  window: string;
  signalCount: number;
  sources: SourceKey[];
  trust: number; // 0-5
  desk: string;
  suggestedAngle: string;
  // Representative image for the card — taken from one of the cluster's articles.
  image?: string;
  topSignals?: { author: string; text: string; meta?: string; url?: string; image?: string }[];
  // Hindi translations (populated for live trends)
  title_hi?: string;
  desk_hi?: string;
  suggestedAngle_hi?: string;
  // Story format AI thinks we should write (Explainer / Profile / Service piece / …)
  storyType?: string;
  storyType_hi?: string;
  isNationalOrWorld?: boolean;
  // AI-generated editorial angles (on demand, persisted). Undefined until generated.
  angles?: StoryAngle[];
  // Minutes since the most recent signal in this cluster — what we display
  // on the card. Updated whenever the cluster catches a new signal.
  lastSeenMinAgo?: number;
};

// No mock data — the dashboard shows an empty/loading state until ingest runs.
export const TRENDS: Trend[] = [];

export const SECTION_COLORS: Record<SectionKey, string> = {
  city: "var(--red)",
  business: "var(--blue)",
  sports: "var(--green)",
  politics: "var(--orange)",
  weather: "var(--amber)",
  enter: "var(--purple)",
  tech: "var(--blue)",
  national: "var(--text)",
  world: "#0d9488",
};

