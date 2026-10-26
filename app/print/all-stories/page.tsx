import AllStoriesPage from "@/app/all-stories/page";

export const dynamic = "force-dynamic";

/** All Stories — the shared all-stories browser (every tracked story, by
 *  section), same as the digital desk. */
export default function PrintAllStoriesPage() {
  return (
    <div className="p-7 pb-20">
      <AllStoriesPage />
    </div>
  );
}
