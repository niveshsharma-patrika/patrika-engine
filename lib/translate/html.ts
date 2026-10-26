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

/**
 * Swap a unit's tags + shortcodes for numbered markers ({{1}}, {{2}} …) so the
 * model only ever sees short tokens — long URLs and attributes can't be
 * altered because they are never sent. unmask() puts the originals back.
 */
export function mask(html: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const text = html.replace(new RegExp(`${TAG.source}|${SHORTCODE.source}`, "g"), (t) => {
    tags.push(t);
    return `{{${tags.length}}}`;
  });
  return { text, tags };
}

const VOID = new Set(["br", "wbr", "img", "hr"]);

/**
 * Restore the original tags. Returns null (caller falls back to plain text) if
 * a marker is missing, duplicated or invented, or if the restored inline tags
 * would not nest properly (e.g. a closing tag moved before its opening tag).
 */
export function unmask(text: string, tags: string[]): string | null {
  const seen = new Set<number>();
  let bad = false;
  const html = text.replace(/\{\{(\d+)\}\}/g, (_, d: string) => {
    const i = Number(d);
    if (i < 1 || i > tags.length || seen.has(i)) { bad = true; return ""; }
    seen.add(i);
    return tags[i - 1];
  });
  if (bad || seen.size !== tags.length) return null;
  const stack: string[] = [];
  for (const t of html.match(TAG) ?? []) {
    const m = /^<(\/?)([a-zA-Z][\w-]*)/.exec(t);
    if (!m) continue;
    const name = m[2].toLowerCase();
    if (VOID.has(name) || t.endsWith("/>")) continue;
    if (!m[1]) stack.push(name);
    else if (stack.pop() !== name) return null;
  }
  return stack.length === 0 ? html : null;
}

/** Escape plain text for safe insertion as HTML (used when a unit's tags had to be dropped). */
export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
