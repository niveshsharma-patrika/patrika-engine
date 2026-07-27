/**
 * Engagement + virality scoring — one shared definition so every platform is
 * measured the same way.
 *
 * These are HEURISTICS, deliberately simple and labelled as estimates in the
 * UI. Reach data varies by platform (views where we have them, follower count
 * otherwise), so cross-platform virality is indicative, not exact.
 *
 *   engagement      = likes + comments + shares
 *   engagement_rate = engagement / reach * 100   (%)   where reach = views || followers
 *   virality_score  = 0-100 index via a saturating curve, so a mega-viral post
 *                     caps near 100 without a hard clamp and typical posts land
 *                     mid-range. Per-platform k tunes where "good" sits.
 */

export type Platform = "youtube" | "x" | "instagram" | "facebook";

export type RawMetrics = {
  likes: number;
  comments: number;
  shares?: number;
  views?: number;
};

// k = engagement-rate (%) at which the curve reaches ~63/100. Lower k → a given
// rate scores higher, matching platforms where engagement rates run lower.
const K: Record<Platform, number> = {
  x: 1.0,          // X engagement rates run low
  facebook: 1.5,
  instagram: 4.0,  // IG rates run higher
  youtube: 4.0,    // likes+comments over views
};

export type Scored = {
  engagement: number;
  engagementRate: number; // percent, 4dp
  viralityScore: number;  // 0-100 integer
};

export function scorePost(
  platform: Platform,
  m: RawMetrics,
  followers: number | null
): Scored {
  const likes = Math.max(0, m.likes || 0);
  const comments = Math.max(0, m.comments || 0);
  const shares = Math.max(0, m.shares || 0);
  const views = Math.max(0, m.views || 0);

  const engagement = likes + comments + shares;

  // Reach: prefer real views; fall back to follower count; never divide by 0.
  const reach = views > 0 ? views : Math.max(followers || 0, 1);
  const engagementRate = reach > 0 ? (engagement / reach) * 100 : 0;

  const k = K[platform] ?? 2.0;
  const viralityScore = Math.round(100 * (1 - Math.exp(-engagementRate / k)));

  return {
    engagement,
    engagementRate: Number(engagementRate.toFixed(4)),
    viralityScore: Math.min(100, Math.max(0, viralityScore)),
  };
}
