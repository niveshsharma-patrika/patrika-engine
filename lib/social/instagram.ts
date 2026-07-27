import { getSecret } from "@/lib/twitter/secrets";
import { META_TOKEN, META_IG_USER_ID, type FetchedAccount, type FetchedPost } from "./types";

/**
 * Instagram fetcher via Meta Graph "business discovery".
 *
 * IMPORTANT — this is the only free way to read a COMPETITOR's public IG data,
 * and it has real preconditions:
 *   • You need your OWN Instagram *business/creator* account, connected to a
 *     Facebook Page.
 *   • A Meta app + a long-lived access token with instagram_basic +
 *     pages_read_engagement (and App Review for production).
 *   • The competitor must ALSO be a business/creator account (personal accounts
 *     are not discoverable). No views for image posts; reach = followers.
 *
 * These are Meta's rules, not a gap in our setup — a token for your own pages
 * does not unlock arbitrary competitor analytics beyond this endpoint.
 */
const GRAPH = "https://graph.facebook.com/v21.0";
const LIMIT = 15;

type BizDiscovery = {
  business_discovery?: {
    followers_count?: number;
    media_count?: number;
    media?: {
      data?: Array<{
        id: string;
        caption?: string;
        like_count?: number;
        comments_count?: number;
        media_url?: string;
        thumbnail_url?: string;
        permalink?: string;
        timestamp?: string;
        media_type?: string;
      }>;
    };
  };
};

export async function fetchInstagram(handle: string): Promise<FetchedAccount> {
  const token = await getSecret(META_TOKEN);
  const igUserId = await getSecret(META_IG_USER_ID);
  if (!token || !igUserId) {
    throw new Error("Instagram needs a Meta token + your IG business account id (Social → Settings).");
  }

  const username = handle.replace(/^@/, "").replace(/.*instagram\.com\//i, "").split(/[/?#]/)[0];

  const fields =
    `business_discovery.username(${username})` +
    `{followers_count,media_count,media.limit(${LIMIT})` +
    `{id,caption,like_count,comments_count,media_url,thumbnail_url,permalink,timestamp,media_type}}`;

  const url = `${GRAPH}/${igUserId}?fields=${encodeURIComponent(fields)}&access_token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Meta returns a helpful message (e.g. account not a business) — surface it.
    throw new Error(`Meta Graph ${res.status}: ${body.slice(0, 240)}`);
  }
  const json = (await res.json()) as BizDiscovery;
  const bd = json.business_discovery;
  if (!bd) throw new Error(`No business-discovery data for "${username}" (is it a business/creator account?).`);

  const posts: FetchedPost[] = (bd.media?.data ?? []).map((m): FetchedPost => ({
    postId: m.id,
    url: m.permalink ?? null,
    content: m.caption ?? "",
    mediaUrl: m.media_url ?? m.thumbnail_url ?? null,
    postedAt: m.timestamp ?? null,
    likes: m.like_count ?? 0,
    comments: m.comments_count ?? 0,
    shares: 0,
    views: 0, // not exposed for image posts via business discovery
  }));

  return {
    externalId: username,
    displayName: username,
    followers: bd.followers_count ?? null,
    posts,
  };
}
