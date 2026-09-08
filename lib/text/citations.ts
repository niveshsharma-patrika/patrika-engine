/**
 * Strip inline web-search citations / source links from model output while
 * KEEPING informative link text (facts and dates often live in the label).
 * Shared by the generate and refine routes so both clean research output the
 * same way.
 */
export function stripCitations(text: string): string {
  return text
    // Markdown links: KEEP the informative link text (facts/dates live there) —
    // drop only pure domain/citation labels and the URL itself.
    .replace(/\(?\s*\[([^\]]*)\]\(https?:\/\/[^)\s]+\)\s*\)?/g, (_m, label: string) => {
      const l = label.trim();
      return /^[\w-]+(\.[\w-]+)+$/.test(l) ? "" : l; // domain-only → drop; text → keep
    })
    .replace(/\(\s*https?:\/\/[^)\s]+\s*\)/g, "") // (url)
    .replace(/https?:\/\/[^\s)]+/g, "") // bare urls
    .replace(/【[^】]*】/g, "") // 【…】 citation markers
    .replace(/\[\s*\]|\(\s*\)/g, "") // leftover empty [] ()
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([।.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
