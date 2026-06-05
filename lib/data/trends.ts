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
  | "national";

export type SourceKey = "x" | "rss" | "gn";

export type Trend = {
  id: number | string;
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
  topSignals?: { author: string; text: string; meta?: string }[];
  // Hindi translations (populated for live trends)
  title_hi?: string;
  desk_hi?: string;
  suggestedAngle_hi?: string;
  // Story format AI thinks we should write (Explainer / Profile / Service piece / …)
  storyType?: string;
  storyType_hi?: string;
  isNationalOrWorld?: boolean;
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
};

