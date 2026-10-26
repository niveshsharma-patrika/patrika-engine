/** Client-safe helpers shared by the print desk components (no server imports). */

export const CAT: Record<string, { en: string; hi: string }> = {
  crime: { en: "Crime", hi: "अपराध" },
  politics: { en: "Politics / Govt", hi: "राजनीति / सरकार" },
  courts: { en: "Courts", hi: "अदालत" },
  civic: { en: "Civic", hi: "नागरिक" },
  national: { en: "National", hi: "राष्ट्रीय" },
  world: { en: "World", hi: "दुनिया" },
  business: { en: "Business", hi: "बिज़नेस" },
  sports: { en: "Sports", hi: "खेल" },
  entertainment: { en: "Entertainment", hi: "मनोरंजन" },
  health: { en: "Health", hi: "स्वास्थ्य" },
  education: { en: "Education", hi: "शिक्षा" },
  technology: { en: "Tech", hi: "टेक" },
  // /api/trends section keys
  tech: { en: "Tech", hi: "टेक" },
  enter: { en: "Entertainment", hi: "मनोरंजन" },
  city: { en: "City", hi: "शहर" },
  weather: { en: "Weather", hi: "मौसम" },
};
export const catLabel = (k: string, hi: boolean): string => (CAT[k] ? (hi ? CAT[k].hi : CAT[k].en) : k);

/** Print copy lengths (word targets). */
export const LENGTHS = [
  { key: "brief", words: 150, en: "Brief · ~150", hi: "संक्षिप्त · ~150" },
  { key: "standard", words: 350, en: "Standard · ~350", hi: "मानक · ~350" },
  { key: "lead", words: 600, en: "Lead · ~600", hi: "लीड · ~600" },
] as const;

export const STATUS: Record<string, { en: string; hi: string; cls: string }> = {
  in_progress: { en: "Draft", hi: "ड्राफ़्ट", cls: "bg-[var(--surface-2)] text-[var(--text-2)]" },
  awaiting_review: { en: "At desk", hi: "डेस्क पर", cls: "bg-[var(--amber-soft,#fef3c7)] text-[var(--amber,#b45309)]" },
  awaiting_approval: { en: "Awaiting approval", hi: "अनुमोदन बाकी", cls: "bg-[var(--amber-soft,#fef3c7)] text-[var(--amber,#b45309)]" },
  approved: { en: "Approved", hi: "स्वीकृत", cls: "bg-[var(--green-soft,#dcfce7)] text-[var(--green)]" },
  published: { en: "Published", hi: "प्रकाशित", cls: "bg-[var(--green-soft,#dcfce7)] text-[var(--green)]" },
  rejected: { en: "Sent back", hi: "वापस भेजा", cls: "bg-[var(--red-soft)] text-[var(--red)]" },
};
export const statusLabel = (s: string, hi: boolean) => (STATUS[s] ? (hi ? STATUS[s].hi : STATUS[s].en) : s);
export const statusCls = (s: string) => STATUS[s]?.cls ?? "bg-[var(--surface-2)] text-[var(--text-2)]";

export function timeAgo(ts: string | null | undefined, hi: boolean): string {
  if (!ts) return "";
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return "";
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return hi ? `${min} मि` : `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return hi ? `${h} घं` : `${h}h`;
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Download a print story as a plain-text file (headline / deck / body). */
export function downloadStoryTxt(headline: string, deck: string, body: string): void {
  const text = [headline, deck, "", body].filter((s, i) => i >= 2 || s).join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(headline || "story").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // revoking synchronously can cancel the download
}

/** Build the /print/write URL for a story or idea. */
export function writeHref(title: string, summary?: string, url?: string, city?: string): string {
  const p = new URLSearchParams({ title });
  if (summary) p.set("summary", summary);
  if (url) p.set("url", url);
  if (city) p.set("city", city);
  return `/print/write?${p.toString()}`;
}
