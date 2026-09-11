import { SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 sm:px-6">
      <div className="flex flex-col gap-7 sm:flex-row sm:gap-9">
        <div className="aspect-square w-44 shrink-0 animate-pulse rounded-xl bg-surface-raised sm:w-60" />
        <div className="flex flex-1 flex-col gap-4 pt-2">
          <SkeletonLine className="w-16" />
          <div className="h-12 w-3/4 max-w-md animate-pulse rounded bg-surface-raised" />
          <SkeletonLine className="w-64" />
          <div className="mt-2 h-16 w-72 animate-pulse rounded-xl bg-surface-raised" />
        </div>
      </div>
      <div className="mt-12 h-40 animate-pulse rounded-xl bg-surface-raised" />
    </main>
  );
}
