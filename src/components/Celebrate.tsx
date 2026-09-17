/** Pieces for the big moments: a crown to drop and sparks to throw. */

export function Crown({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`text-score-overall drop-shadow-[0_4px_12px_rgba(245,197,24,0.55)] ${className}`}
      fill="currentColor"
    >
      <path d="M3 8.5l4.2 3.3L12 5l4.8 6.8L21 8.5 19.4 18H4.6L3 8.5z" />
      <rect x="4.6" y="19.2" width="14.8" height="1.8" rx="0.9" />
    </svg>
  );
}

const COLOURS = ["#f5c518", "#f2803f", "#f4f4f6"];

/**
 * A burst of sparks from the centre of whatever holds it, which needs to be
 * positioned. Purely decorative, and gone for anyone who prefers less motion.
 */
export function Sparks({ count = 16, reach = 120, delay = 0.45 }: {
  count?: number;
  /** How far they fly, in pixels. */
  reach?: number;
  /** Seconds before they go. */
  delay?: number;
}) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-0 w-0">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`spark absolute ${i % 2 ? "-left-0.5 -top-1.5 h-3 w-1 rounded-sm" : "-left-1 -top-1 h-2 w-2 rounded-full"}`}
          style={
            {
              "--angle": `${(360 / count) * i + (i % 2 ? 9 : 0)}deg`,
              "--reach": `-${reach + (i % 3) * 22}px`,
              "--delay": `${delay + (i % 4) * 0.05}s`,
              background: COLOURS[i % COLOURS.length],
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
