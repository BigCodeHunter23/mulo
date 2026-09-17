import { SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 sm:px-6">
      {/* Matches the page it stands in for: centred on a phone, beside the
          photo from tablet width up, so nothing jumps when it arrives. */}
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:gap-9">
        <div className="h-48 w-48 shrink-0 animate-pulse rounded-full bg-surface-raised" />
        <div className="flex w-full flex-col items-center gap-4 sm:flex-1 sm:items-start sm:pb-2">
          <SkeletonLine className="w-16" />
          <div className="h-12 w-2/3 max-w-lg animate-pulse rounded bg-surface-raised" />
          <SkeletonLine className="w-24" />
          <div className="mt-2 h-16 w-full animate-pulse rounded-xl bg-surface-raised sm:w-72" />
        </div>
      </div>
      <div className="mt-7 max-w-3xl space-y-2.5">
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-11/12" />
        <SkeletonLine className="w-4/5" />
      </div>
      <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-5">
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
