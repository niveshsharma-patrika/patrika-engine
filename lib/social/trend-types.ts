/** One trending item as returned by a platform fetcher (reddit / x). */
export type FetchedTrendItem = {
  externalId: string;      // globally unique (prefixed by platform)
  title: string;
  body: string;
  url: string | null;      // external link, if the post points to one
  permalink: string | null; // link to the discussion / tweet
  thumbnail: string | null;
  author: string | null;
  origin: string | null;   // subreddit name / search keyword
  score: number;           // upvotes / likes
  comments: number;
  postedAt: string | null; // ISO
};

/** The generated multi-platform creative pack for a trend. */
export type CreativePack = {
  angle: string;           // the Patrika news angle
  x: string;               // ≤280 chars incl. hashtags
  instagram: string;       // caption + hashtags
  facebook: string;        // post copy
  youtube_title: string;
  hashtags: string[];
  image_concept: string;   // described visual
  caution: string;         // verification / sensitivity note
};
