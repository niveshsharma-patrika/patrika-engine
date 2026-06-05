import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/style/extract-url
 * Body: { url: string }
 * Returns: { title, body, byline?, length?, sourceUrl }
 *
 * Server-side fetch of the URL, run through Mozilla Readability (the same
 * engine that powers Firefox's reader mode). Works on ~90% of news sites
 * out of the box. Returns the cleaned title + article body as plain text
 * for the user to review before saving as a style sample.
 */

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
  "Upgrade-Insecure-Requests": "1",
};

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = body.url?.toString().trim();
  if (!url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  // Validate it actually looks like a URL.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (!parsed.protocol.startsWith("http")) {
    return Response.json({ error: "Only http(s) URLs supported" }, { status: 400 });
  }

  // Fetch the page HTML.
  let html: string;
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!res.ok) {
      return Response.json(
        { error: `Fetch failed: HTTP ${res.status}` },
        { status: 502 }
      );
    }
    html = await res.text();
  } catch (err) {
    return Response.json(
      {
        error: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 }
    );
  }

  // Run Readability over the page.
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article || !article.textContent?.trim()) {
      return Response.json(
        {
          error:
            "Couldn't extract an article body from this URL. Try pasting the text directly.",
        },
        { status: 422 }
      );
    }
    return Response.json({
      title: article.title?.trim() ?? "",
      body: article.textContent.trim(),
      byline: article.byline ?? null,
      length: article.length ?? null,
      sourceUrl: url,
    });
  } catch (err) {
    return Response.json(
      {
        error: `Parse failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
