import { getSecret } from "@/lib/twitter/secrets";
import { YT_API_KEY, type FetchedAccount, type FetchedPost } from "./types";

/**
 * YouTube Data API v3 fetcher — the reliable, fully-official path.
 *
 * Free with a 10,000-unit/day quota. One account sync costs ~3-5 units
 * (channels.list + playlistItems.list + videos.list), so dozens of competitor
 * channels fit comfortably.
 *
 * Accepts a channel id (UC…), an @handle, a full channel URL, or a legacy
 * username, and resolves it to a channel via the API.
 */
const API = "https://www.googleapis.com/youtube/v3";
const MAX_VIDEOS = 15;

type ChannelResp = {
  items?: Array<{
    id: string;
    snippet?: { title?: string };
    statistics?: { subscriberCount?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
};

type PlaylistResp = { items?: Array<{ contentDetails?: { videoId?: string } }> };

type VideosResp = {
  items?: Array<{
    id: string;
    snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  }>;
};

function channelSelector(handle: string): string {
  const h = handle.trim();
  // Full URL forms
  const urlChannel = h.match(/youtube\.com\/channel\/(UC[\w-]+)/i);
  if (urlChannel) return `id=${urlChannel[1]}`;
  const urlHandle = h.match(/youtube\.com\/@([\w.-]+)/i);
  if (urlHandle) return `forHandle=@${urlHandle[1]}`;
  const urlUser = h.match(/youtube\.com\/user\/([\w.-]+)/i);
  if (urlUser) return `forUsername=${urlUser[1]}`;
  // Bare forms
  if (/^UC[\w-]{20,}$/.test(h)) return `id=${h}`;
  return `forHandle=${h.startsWith("@") ? h : "@" + h}`;
}

async function j<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function fetchYouTube(handle: string): Promise<FetchedAccount> {
  const key = await getSecret(YT_API_KEY);
  if (!key) throw new Error("No YouTube API key set (Social → Settings).");

  const chan = await j<ChannelResp>(
    `${API}/channels?part=snippet,statistics,contentDetails&${channelSelector(handle)}&key=${key}`
  );
  const c = chan.items?.[0];
  if (!c) throw new Error(`Channel not found for "${handle}".`);

  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  const followers = c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null;

  let posts: FetchedPost[] = [];
  if (uploads) {
    const pl = await j<PlaylistResp>(
      `${API}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=${MAX_VIDEOS}&key=${key}`
    );
    const ids = (pl.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean).join(",");
    if (ids) {
      const vids = await j<VideosResp>(
        `${API}/videos?part=snippet,statistics&id=${ids}&key=${key}`
      );
      posts = (vids.items ?? []).map((v): FetchedPost => {
        const thumbs = v.snippet?.thumbnails ?? {};
        const thumb = thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? null;
        return {
          postId: v.id,
          url: `https://www.youtube.com/watch?v=${v.id}`,
          content: v.snippet?.title ?? "",
          mediaUrl: thumb,
          postedAt: v.snippet?.publishedAt ?? null,
          likes: Number(v.statistics?.likeCount ?? 0),
          comments: Number(v.statistics?.commentCount ?? 0),
          shares: 0, // not exposed by the API
          views: Number(v.statistics?.viewCount ?? 0),
        };
      });
    }
  }

  return {
    externalId: c.id,
    displayName: c.snippet?.title ?? null,
    followers,
    posts,
  };
}
