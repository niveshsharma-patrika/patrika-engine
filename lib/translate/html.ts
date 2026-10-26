/**
 * Split WordPress article HTML into translatable text units without letting the
 * model touch the markup. A unit is a run of text plus INLINE tags (<strong>,
 * <a>, <em>, <br> …) between block boundaries (<p>, <h2>, <li>, comments …), so
 * a sentence with a bold word or a link stays one unit and translates
 * naturally. Block tags, Gutenberg comments and opaque elements (script, style,
 * iframe, svg, pre) pass through byte-for-byte.
 */

const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "del", "dfn", "em", "i", "ins",
  "kbd", "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u", "wbr",
]);

// Comments | opaque elements (kept whole) | any tag.
const TOKEN = /<!--[\s\S]*?-->|<(script|style|iframe|svg|noscript|pre|textarea)\b[\s\S]*?<\/\1\s*>|<\/?[a-zA-Z][^>]*>/gi;
const DEVANAGARI = /\p{Script=Devanagari}/u;
const TAG = /<\/?[a-zA-Z][^>]*>/g;
const SHORTCODE = /\[\/?[a-zA-Z_][\w-]*(?:\s[^\]]*)?\]/g;

export type Piece = { kind: "raw"; html: string } | { kind: "unit"; id: string; html: string };

export function splitHtml(html: string): Piece[] {
  const pieces: Piece[] = [];
  let buf = "";
  let n = 0;

  // Plain text (no markup): one unit per line, line breaks kept exactly.
  if (!/<[a-zA-Z!/]/.test(html)) {
    for (const part of html.split(/(\n+)/)) {
      if (!part) continue;
      if (/^\n+$/.test(part)) pieces.push({ kind: "raw", html: part });
      else { buf = part; flushText(); }
    }
    return pieces;
  }

  function flushText() {
    if (!buf) return;
    // Keep surrounding whitespace outside the unit; only text with Hindi in it
    // is sent for translation (English-only / numeric runs stay as they are).
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(buf)!;
    if (m[2] && DEVANAGARI.test(m[2])) {
      if (m[1]) pieces.push({ kind: "raw", html: m[1] });
      pieces.push({ kind: "unit", id: `u${++n}`, html: m[2] });
      if (m[3]) pieces.push({ kind: "raw", html: m[3] });
    } else {
      pieces.push({ kind: "raw", html: buf });
    }
    buf = "";
  }

  let last = 0;
  for (const match of html.matchAll(TOKEN)) {
    const idx = match.index ?? 0;
    buf += html.slice(last, idx);
    const tok = match[0];
    const name = /^<\/?([a-zA-Z][\w-]*)/.exec(tok)?.[1]?.toLowerCase();
    if (name && INLINE.has(name) && !match[1]) {
      buf += tok;
    } else {
      flushText();
      pieces.push({ kind: "raw", html: tok });
    }
    last = idx + tok.length;
  }
  buf += html.slice(last);
  flushText();
  return pieces;
}

export function joinHtml(pieces: Piece[], translated: Map<string, string>): string {
  return pieces.map((p) => (p.kind === "raw" ? p.html : translated.get(p.id) ?? p.html)).join("");
}

/** The markup a unit carries (tags + shortcodes), order-independent. */
export function markupOf(html: string): string[] {
  return [...(html.match(TAG) ?? []), ...(html.match(SHORTCODE) ?? [])].map((t) => t.replace(/\s+/g, " ")).sort();
}

export function sameMarkup(a: string, b: string): boolean {
  const x = markupOf(a), y = markupOf(b);
  return x.length === y.length && x.every((t, i) => t === y[i]);
}

export function stripTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|iframe|svg|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(TAG, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Escape plain text for safe insertion as HTML (used when a unit's tags had to be dropped). */
export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
