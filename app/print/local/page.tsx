import { PrintLocal } from "@/components/print-local";

export const dynamic = "force-dynamic";

/** Local — stories from the print desk's own per-city sources. */
export default async function PrintLocalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { city } = await searchParams;
  return <PrintLocal initialCity={typeof city === "string" ? city : ""} />;
}
