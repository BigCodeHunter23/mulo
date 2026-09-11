import { SkeletonHeading, SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SkeletonHeading className="mb-5 w-44" />
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3.5 rounded-xl border border-border bg-surface p-3.5"
          >
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-raised" />
            <div className="flex-1 space-y-2">
              <SkeletonLine className="w-32" />
              <SkeletonLine className="w-20" />
            </div>
            <div className="h-8 w-20 animate-pulse rounded-lg bg-surface-raised" />
          </li>
        ))}
      </ul>
    </main>
  );
}
