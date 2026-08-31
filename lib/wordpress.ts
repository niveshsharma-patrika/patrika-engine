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

/** WordPress-safe slug from a title (keeps Devanagari; WP URL-encodes it). */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
