import DashboardPage from "@/app/page";

export const dynamic = "force-dynamic";

/** Print desk home — a replica of the digital dashboard (all tabs + stories),
 *  with the composer in print mode (saves to drafts, no WordPress). */
export default function PrintHomePage() {
  return <DashboardPage printMode />;
}
