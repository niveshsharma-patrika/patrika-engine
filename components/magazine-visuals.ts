import {
  ShieldAlert, Landmark, Building2, Wheat, Scale, HeartHandshake,
  HeartPulse, GraduationCap, Trophy, UtensilsCrossed, BookOpen,
  Globe, TrendingUp, Cpu, Leaf, Sprout, Flame, Star, Plane, Clapperboard,
  Ribbon, PenSquare,
  type LucideIcon,
} from "lucide-react";

/**
 * Themed cover (gradient + icon) per desk — shared by the Patrika+ deck and the
 * Quick Bytes deck. Kept in its own module (no React component imports) so both
 * can reuse it without pulling the whole composer into their bundle.
 */
export const VISUALS: Record<string, { from: string; to: string; Icon: LucideIcon }> = {
  "crime-files":     { from: "#991b1b", to: "#450a0a", Icon: ShieldAlert },
  "politics-power":  { from: "#4338ca", to: "#1e1b4b", Icon: Landmark },
  "city-pulse":      { from: "#0d9488", to: "#134e4a", Icon: Building2 },
  "rural-panchayat": { from: "#16a34a", to: "#14532d", Icon: Wheat },
  "public-guide":    { from: "#2563eb", to: "#172554", Icon: Scale },
  "nari-shakti":     { from: "#db2777", to: "#500724", Icon: HeartHandshake },
  "health-plus":     { from: "#059669", to: "#064e3b", Icon: HeartPulse },
  "ai-education":    { from: "#7c3aed", to: "#2e1065", Icon: GraduationCap },
  "game-on":         { from: "#ea580c", to: "#7c2d12", Icon: Trophy },
  "food-culture":    { from: "#d97706", to: "#78350f", Icon: UtensilsCrossed },
  "world":           { from: "#1e40af", to: "#172554", Icon: Globe },
  "business":        { from: "#0891b2", to: "#164e63", Icon: TrendingUp },
  "tech-pulse":      { from: "#4f46e5", to: "#312e81", Icon: Cpu },
  "climate":         { from: "#0284c7", to: "#0c4a6e", Icon: Leaf },
  "kisan":           { from: "#65a30d", to: "#3f6212", Icon: Sprout },
  "aastha":          { from: "#f59e0b", to: "#92400e", Icon: Flame },
  "astro-guide":     { from: "#7e22ce", to: "#3b0764", Icon: Star },
  "travel":          { from: "#e11d48", to: "#881337", Icon: Plane },
  "entertainment":   { from: "#c026d3", to: "#4a044e", Icon: Clapperboard },
  "cancer-care":     { from: "#7c3aed", to: "#4c1d95", Icon: Ribbon },
  "custom":          { from: "#475569", to: "#1e293b", Icon: PenSquare },
};

export const FALLBACK_VISUAL = { from: "#6b7280", to: "#374151", Icon: BookOpen };
