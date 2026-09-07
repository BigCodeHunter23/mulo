/** Grey placeholder blocks used by the route-level loading screens. */
export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`h-4 animate-pulse rounded bg-gray-200 ${className}`} />;
}

export function SkeletonHeading({ className = "" }: { className?: string }) {
  return <div className={`h-7 animate-pulse rounded bg-gray-200 ${className}`} />;
}

/** A feed or list row: square artwork with a few lines beside it. */
export function SkeletonRow() {
  return (
    <li className="flex gap-4 border-b border-gray-200 py-5">
      <div className="h-24 w-24 shrink-0 animate-pulse bg-gray-200" />
      <div className="flex-1 space-y-2 pt-1">
        <SkeletonLine className="w-1/3" />
        <SkeletonLine className="w-2/3" />
        <SkeletonLine className="w-1/2" />
      </div>
    </li>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <ul className="flex flex-col">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </ul>
  );
}
