import { SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 sm:px-6">
      {/* Matches the page it stands in for: centred on a phone, beside the
          cover from tablet width up, so nothing jumps when it arrives. */}
      <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-end sm:gap-9">
        <div className="aspect-square w-[64%] max-w-72 shrink-0 animate-pulse rounded-xl bg-surface-raised sm:w-60" />
        <div className="flex w-full flex-col items-center gap-4 sm:flex-1 sm:items-start sm:pb-2">
          <SkeletonLine className="w-16" />
          <div className="h-11 w-3/4 max-w-md animate-pulse rounded bg-surface-raised" />
          <SkeletonLine className="w-48" />
          <div className="mt-2 h-16 w-full animate-pulse rounded-xl bg-surface-raised sm:w-72" />
        </div>
      </div>
      <div className="mt-12 h-40 animate-pulse rounded-xl bg-surface-raised" />
    </main>
  );
}
