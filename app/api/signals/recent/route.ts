import { createAdminClient } from "@/lib/supabase/server";
import { translateToHindi } from "@/lib/ai/translate";

export const dynamic = "force-dynamic";

type SignalRow = {
  id: string;
  author: string | null;
  content: string;
  published_at: string;
  url: string | null;
  sources: { source_type: string; name: string } | null;
};

/**
 * GET /api/signals/recent[?lang=en|hi] — last 30 ingested signals across all
 * sources, formatted for the dashboard ticker. When lang=hi, texts are
 * batch-translated via Groq Llama and cached server-side.
 *
 * Returns: { items: [{ author, text, ageMin, isWatchlist }] }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "hi" ? "hi" : "en";
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ items: [] });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("signals")
    .select(
      `id, author, content, published_at, url,
       sources ( source_type, name )`
    )
    .order("published_at", { ascending: false })
    .limit(30);

  type Item = {
    author: string;
    text: string;
    ageMin: number;
    isWatchlist: boolean;
    url: string | null;
  };

  const items: Item[] = ((data as SignalRow[] | null) ?? []).map((s) => {
    const srcRel = Array.isArray(s.sources) ? s.sources[0] : s.sources;
    const isWatchlist = srcRel?.source_type === "twitter";

    // "title — snippet" → keep title only for ticker brevity
    const text = s.content.split(" — ")[0].slice(0, 140);

    // For Twitter, use the handle. For everything else, use the short source
    // name (TOI, NDTV) rather than the verbose feed title.
    const author = isWatchlist
      ? (s.author ?? srcRel?.name ?? "Twitter")
      : (srcRel?.name ?? s.author ?? "Source");

    const ageMin = Math.max(
      1,
      Math.round((Date.now() - new Date(s.published_at).getTime()) / 60000)
    );
    return { author, text, ageMin, isWatchlist, url: s.url };
  });

  if (lang === "hi" && items.length > 0) {
    try {
      const translated = await translateToHindi(items.map((i) => i.text));
      items.forEach((it, i) => {
        if (translated[i]) it.text = translated[i];
      });
    } catch {
      // fall through with English text
    }
  }

  return Response.json({ items, lang });
}
