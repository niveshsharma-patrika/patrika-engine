/**
 * Patrika Kairos logomark — a red rounded badge with a white "K" and an amber
 * spark (Kairos = the decisive/opportune moment). Reused in the masthead and on
 * the login screen. Inside a `group` parent it picks up the red hover.
 */
export function KairosMark({
  size = 44,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const inner = Math.round(size * 0.6);
  return (
    <div
      className={`relative grid place-items-center bg-[var(--red)] group-hover:bg-[var(--red-hover)] transition-colors ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.25),
        boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.2)",
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <g stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 5 V21" />
          <path d="M8.5 13.2 L17.5 5" />
          <path d="M8.5 13.2 L17.5 21" />
        </g>
        <path
          d="M21 2.2 L21.85 4.55 L24.2 5.4 L21.85 6.25 L21 8.6 L20.15 6.25 L17.8 5.4 L20.15 4.55 Z"
          fill="var(--amber)"
        />
      </svg>
    </div>
  );
}
