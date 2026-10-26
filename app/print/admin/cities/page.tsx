import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { PrintCities } from "@/components/print-cities";

export const dynamic = "force-dynamic";

/** Admin — cities / editions the print desk covers. */
export default async function PrintCitiesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/print");
  return <PrintCities />;
}
