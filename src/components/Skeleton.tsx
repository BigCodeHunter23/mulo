/** Grey placeholder blocks used by the route-level loading screens. */
export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div className={`h-3.5 animate-pulse rounded bg-surface-raised ${className}`} />
  );
}

export function SkeletonHeading({ className = "" }: { className?: string }) {
  return (
    <div className={`h-6 animate-pulse rounded bg-surface-raised ${className}`} />
  );
}

/** A feed or list row: square artwork with a few lines beside it. */
export function SkeletonRow() {
  return (
    <li className="flex gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-surface-raised" />
      <div className="flex-1 space-y-2.5 pt-1">
        <SkeletonLine className="w-1/3" />
        <SkeletonLine className="w-2/3" />
        <SkeletonLine className="w-1/2" />
      </div>
    </li>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </ul>
  );
}
