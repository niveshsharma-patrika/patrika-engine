import { generateText } from "ai";

import { getModelFor } from "@/lib/ai/provider";
import { getSecret } from "@/lib/twitter/secrets";

/**
 * "Save to WordPress draft" for Patrika+ content.
 *
 * The engine POSTs a generated article to the Patrika WordPress plugin's REST
 * endpoint, authenticated with a per-site API key sent as X-Kairos-API-Key.
 * Both the key and the endpoint are stored AES-GCM encrypted in
 * integration_secrets (entered in Admin) — never in code or the browser. The
 * POST always runs server-side so the key never reaches the client.
 */
export const WP_API_KEY = "wordpress_api_key";
export const WP_ENDPOINT = "wordpress_endpoint";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape, then turn **bold** into <strong>. */
function inline(s: string): string {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/**
 * Convert the plain-text article the pipeline produces (blank-line paragraphs,
 * plain-text subheadings, light markdown: ## headings, **bold**, - lists,
 * | tables |) into clean, safe HTML for WordPress. All text is HTML-escaped.
 */
export function bodyToHtml(body: string): string {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

    // Markdown table: a header row + a |---|---| separator row.
    if (lines.length >= 2 && lines[0].includes("|") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1])) {
      const cells = (l: string) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const rows = lines.filter((_, i) => i !== 1);
      const head = cells(rows[0]);
      const bodyRows = rows.slice(1).map(cells);
      out.push(
        "<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") +
        "</tr></thead><tbody>" +
        bodyRows.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
        "</tbody></table>"
      );
      continue;
    }

    // Markdown heading (# .. ####).
    const h = block.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length + 1, 4);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }

    // Bulleted / numbered list — also a single-item list, so a lone "- item"
    // never falls through to a literal "<p>- item</p>".
    if (lines.every((l) => /^[-•*]\s+/.test(l))) {
      out.push("<ul>" + lines.map((l) => `<li>${inline(l.replace(/^[-•*]\s+/, ""))}</li>`).join("") + "</ul>");
      continue;
    }
    if (lines.every((l) => /^\d+[.)]\s+/.test(l))) {
      out.push("<ol>" + lines.map((l) => `<li>${inline(l.replace(/^\d+[.)]\s+/, ""))}</li>`).join("") + "</ol>");
      continue;
    }

    // A short, single, un-punctuated line (or a **bold-only** line) = subheading.
    // Require the bold line to be EXACTLY one bold span (no interior *), so a
    // sentence like "**Note:** stay **alert**" is NOT treated as a heading.
    const bold = block.match(/^\*\*([^*]+)\*\*$/);
    const single = lines.length === 1;
    if (bold || (single && block.length <= 72 && !/[।.!?:;]$/.test(block) && !/^[-•*\d]/.test(block))) {
      out.push(`<h2>${inline(bold ? bold[1] : block)}</h2>`);
      continue;
    }

    // Paragraph — join wrapped lines with a space.
    out.push(`<p>${inline(lines.join(" "))}</p>`);
  }
  return out.join("\n");
}

/** Lowercase, hyphen-separated slug. Keeps any letters/numbers it is given
 *  (so an English string stays English; a Devanagari string stays Devanagari). */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Build an ENGLISH URL slug from an article title.
 *
 * English/ASCII titles slugify directly. A Hindi (or any non-ASCII) title is
 * first translated to a short English slug by the AI model, so the public
 * WordPress URL reads as English rather than percent-encoded Devanagari.
 * Falls back to a direct slug of the title if the model is unavailable or
 * returns nothing usable — the draft still saves, just with a non-English slug.
 */
export async function englishSlug(title: string): Promise<string> {
  const clean = title.trim();
  if (!clean) return "";

  // Already plain ASCII (English headline) — no translation needed.
  if (!/[^\p{ASCII}]/u.test(clean)) return slugify(clean);

  const resolved = await getModelFor("headline");
  if (resolved) {
    try {
      const { text } = await generateText({
        model: resolved.model,
        temperature: 0.2,
        prompt: `Turn this Hindi news headline into a short English URL slug.
Rules:
- 3 to 8 words capturing the key subject of the headline.
- English words only. Translate the meaning; transliterate proper names of people and places to Latin script.
- Lowercase, plain words separated by single spaces. No punctuation, quotes, or commentary.
- Output ONLY the slug words, nothing else.

Headline: ${clean}`,
      });
      // Pick the most slug-like line. Rank each usable line: a "slug:"-labelled
      // line (2) beats a "bare" line with no sentence punctuation (1), which
      // beats a sentence/interjection like "Sure!" or "Hope this helps!" (0).
      // Ties go to the later line, since any preamble precedes the answer.
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const stripLabel = (l: string) => l.replace(/^.*?\bslug\b\s*[:\-]?\s*/i, "");
      const toSlug = (l: string) => slugify(stripLabel(l).replace(/[^\x00-\x7F]+/g, " "));
      let best = "";
      let bestRank = -1;
      for (const l of lines) {
        if (!toSlug(l)) continue; // no usable words on this line
        const rank = /\bslug\b\s*[:\-]/i.test(l) ? 2 : /[.!?]$/.test(l) ? 0 : 1;
        if (rank >= bestRank) { best = l; bestRank = rank; }
      }
      const en = toSlug(best);
      if (en && /[a-z0-9]/.test(en)) return en;
    } catch {
      /* fall through to the direct-slug fallback */
    }
  }

  // Fallback: slug straight from the title (WordPress URL-encodes Devanagari).
  return slugify(clean);
}

export type WpConfig = { apiKey: string; endpoint: string };

/** The stored key + endpoint (endpoint falls back to WORDPRESS_ENDPOINT env). */
export async function getWpConfig(): Promise<WpConfig | null> {
  const [apiKey, endpointSecret] = await Promise.all([getSecret(WP_API_KEY), getSecret(WP_ENDPOINT)]);
  const endpoint = (endpointSecret || process.env.WORDPRESS_ENDPOINT || "").trim();
  if (!apiKey || !endpoint) return null;
  return { apiKey, endpoint };
}

export type WpPost = { title: string; content: string; short_description?: string; slug?: string };

/** POST one post to the WordPress plugin. Returns the plugin's response. */
export async function postToWordPress(
  post: WpPost
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  const cfg = await getWpConfig();
  if (!cfg) {
    return { ok: false, status: 503, error: "WordPress is not configured — set the API key and endpoint in Admin." };
  }
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Kairos-API-Key": cfg.apiKey },
      body: JSON.stringify(post),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) {
      const error =
        res.status === 429
          ? "WordPress rate limit reached — wait a minute and try again."
          : res.status === 401 || res.status === 403
          ? "WordPress rejected the API key — check it in Admin."
          : res.status === 404
          ? "WordPress route not found (404) — check the Endpoint URL in Admin (it should end in /wp-json/kairos/v1/posts) and that the plugin is active on that site."
          : `WordPress returned ${res.status}.`;
      return { ok: false, status: res.status, data, error };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message.slice(0, 200) : "Request to WordPress failed.",
    };
  }
}
