import { SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 sm:px-6">
      <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:gap-9">
        <div className="h-40 w-40 shrink-0 animate-pulse rounded-full bg-surface-raised sm:h-48 sm:w-48" />
        <div className="flex flex-1 flex-col gap-4 pb-2">
          <SkeletonLine className="w-16" />
          <div className="h-14 w-2/3 max-w-lg animate-pulse rounded bg-surface-raised" />
          <SkeletonLine className="w-24" />
        </div>
      </div>
      <div className="mt-7 max-w-3xl space-y-2.5">
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-11/12" />
        <SkeletonLine className="w-4/5" />
      </div>
      <div className="mt-12 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i}>
            <div className="aspect-square animate-pulse rounded-lg bg-surface-raised" />
            <SkeletonLine className="mt-2.5 w-3/4" />
          </div>
        ))}
      </div>
    </main>
  );
}
