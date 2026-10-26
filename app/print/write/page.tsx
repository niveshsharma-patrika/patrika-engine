import { PrintWrite, type WriteInitial } from "@/components/print-write";

export const dynamic = "force-dynamic";

/** Write a story — generate, edit, save to drafts (no WordPress). Keyed by the
 *  query so every "Write" link / reopened draft mounts a fresh composer. */
export default async function PrintWritePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const initial: WriteInitial = { draftId: one("draftId"), title: one("title"), summary: one("summary"), url: one("url"), city: one("city") };
  return <PrintWrite key={JSON.stringify(sp)} initial={initial} />;
}
