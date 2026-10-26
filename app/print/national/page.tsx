import DashboardPage from "@/app/page";

export const dynamic = "force-dynamic";

/** National — the full digital dashboard (breaking / trending / developing /
 *  watching / newswire / social + the editor), shared with the digital desk.
 *  printMode hides digital-only actions (WordPress publish). */
export default function PrintNationalPage() {
  return (
    <div className="p-7 pb-20">
      <DashboardPage printMode />
    </div>
  );
}
