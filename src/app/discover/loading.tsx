import { SkeletonHeading, SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SkeletonHeading className="mb-5 w-48" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i}>
            <div className="aspect-square animate-pulse rounded-lg bg-surface-raised" />
            <SkeletonLine className="mt-2.5 w-3/4" />
            <SkeletonLine className="mt-1.5 w-1/2" />
          </div>
        ))}
      </div>
    </main>
  );
}
