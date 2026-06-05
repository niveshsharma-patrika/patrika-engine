import { SkeletonGrid } from "@/components/skeletons";

/**
 * Route-level loading UI. The Shell (masthead + nav) lives in the layout and
 * stays put across navigations, so this skeleton only fills the content area
 * while a page streams in.
 */
export default function Loading() {
  return <SkeletonGrid count={8} />;
}
