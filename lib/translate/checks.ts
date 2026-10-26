/**
 * Deterministic accuracy checks on a Hindi → English translation. These catch
 * the failure modes that matter most for news — a changed or dropped figure,
 * text left untranslated, a paragraph that shrank or grew — without trusting
 * the model to grade itself.
 */

export type Flag = { type: string; unit?: string; detail: string };

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const DEVANAGARI = /\p{Script=Devanagari}+/gu;

/** Every number in a text, normalised: Devanagari digits → ASCII, grouping commas removed. */
export function numbersIn(text: string): string[] {
  const ascii = text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  return (ascii.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((n) => n.replace(/,/g, "").replace(/\.0+$/, ""))
    .filter((n) => n.length > 0);
}

function countMap(xs: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Check one aligned pair (Hindi source text, English translation text). */
export function checkPair(unit: string, label: string, hi: string, en: string): Flag[] {
  const flags: Flag[] = [];

  // Figures: every number in the Hindi must be in the English, and the English
  // must not introduce numbers of its own.
  const hiNums = countMap(numbersIn(hi));
  const enNums = countMap(numbersIn(en));
  const missing = [...hiNums].filter(([n, c]) => (enNums.get(n) ?? 0) < c).map(([n]) => n);
  const added = [...enNums].filter(([n, c]) => (hiNums.get(n) ?? 0) < c).map(([n]) => n);
  if (missing.length) flags.push({ type: "number_missing", unit, detail: `${label}: number(s) ${missing.join(", ")} from the Hindi are not in the English.` });
  if (added.length) flags.push({ type: "number_added", unit, detail: `${label}: number(s) ${added.join(", ")} appear in the English but not in the Hindi.` });

  // Hindi left untranslated.
  const leftover = en.match(DEVANAGARI);
  if (leftover) flags.push({ type: "untranslated", unit, detail: `${label}: Hindi text left in the English ("${leftover.slice(0, 3).join(" ")}").` });

  // Size drift — English news runs ~0.8–1.2× the Hindi word count. Only judged
  // on paragraphs long enough for the ratio to mean something.
  const hw = words(hi), ew = words(en);
  if (hw >= 25) {
    const r = ew / hw;
    if (r < 0.55) flags.push({ type: "possible_omission", unit, detail: `${label}: the English is much shorter than the Hindi (${ew} vs ${hw} words) — something may be left out.` });
    else if (r > 1.6) flags.push({ type: "possible_addition", unit, detail: `${label}: the English is much longer than the Hindi (${ew} vs ${hw} words) — something may have been added.` });
  }
  return flags;
}
