import { PrintStories } from "@/components/print-stories";

export const dynamic = "force-dynamic";

/** Print desk home — national + local stories, filtered by city + category. */
export default function PrintHomePage() {
  return <PrintStories />;
}
