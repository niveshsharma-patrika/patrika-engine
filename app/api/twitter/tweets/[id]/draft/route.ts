import { getSession } from "@/lib/auth/session";
import { draftSingleTweet } from "@/lib/twitter/draft";

// One web-search-grounded article. Same headroom as the composer's topic path.
export const maxDuration = 180;
export const dynamic = "force-dynamic";

/**
 * POST /api/twitter/tweets/[id]/draft — "Write article" on one specific tweet.
 *
 * The editor picks the post; there is no rule deciding for them. Works on any
 * tweet including retweets and one-liners — a human asking for an article IS
 * the editorial decision.
 *
 * Still isolated: writes only to twitter_drafts / tweets. The newsroom drafts
 * table is reached only via the separate "Move to draft" action.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  try {
    const result = await draftSingleTweet(id);
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 422 });
    }
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
