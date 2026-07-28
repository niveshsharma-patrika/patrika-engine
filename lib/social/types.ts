import type { Platform } from "./score";

/** Normalised result every platform fetcher returns. */
export type FetchedAccount = {
  externalId: string | null;
  displayName: string | null;
  followers: number | null;
  posts: FetchedPost[];
};

export type FetchedPost = {
  postId: string;
  url: string | null;
  content: string;
  mediaUrl: string | null;
  postedAt: string | null; // ISO
  likes: number;
  comments: number;
  shares: number;
  views: number;
};

export type Fetcher = (handle: string) => Promise<FetchedAccount>;

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
};

// Secret keys in integration_secrets (encrypted, reused from the X cookie store).
export const YT_API_KEY = "youtube_api_key";
export const META_TOKEN = "meta_access_token";
export const META_IG_USER_ID = "meta_ig_user_id";
// Reddit blocks unauthenticated datacenter IPs, so trends need an OAuth app.
export const REDDIT_CLIENT_ID = "reddit_client_id";
export const REDDIT_CLIENT_SECRET = "reddit_client_secret";
