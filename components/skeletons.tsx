/**
 * Shimmer placeholders shown while data loads — shaped to match the real
 * image-forward cards so the layout doesn't jump when content arrives.
 */

/** One card-shaped skeleton: image area + a few title lines + a footer. */
export function SkeletonCard() {
  return (
    <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-video w-full bg-[var(--surface-2)]" />
      <div className="p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="h-2.5 w-16 rounded bg-[var(--surface-2)]" />
          <div className="h-2.5 w-9 rounded bg-[var(--surface-2)]" />
        </div>
        <div className="h-3 w-full rounded bg-[var(--surface-2)]" />
        <div className="h-3 w-11/12 rounded bg-[var(--surface-2)]" />
        <div className="h-3 w-2/3 rounded bg-[var(--surface-2)]" />
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-[var(--border)]">
          <div className="h-2.5 w-12 rounded bg-[var(--surface-2)]" />
          <div className="h-2.5 w-10 rounded bg-[var(--surface-2)]" />
        </div>
      </div>
    </div>
  );
}

/** A grid of skeleton cards — generic "page is loading" filler. */
export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <>
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--text)]">
        <div className="h-3.5 w-32 rounded bg-[var(--surface-2)] animate-pulse" />
        <div className="h-3 w-20 rounded bg-[var(--surface-2)] animate-pulse" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </>
  );
}
