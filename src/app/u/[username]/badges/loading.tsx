import { SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SkeletonLine className="mb-6 w-24" />
      <div className="mb-10 flex flex-col gap-3">
        <SkeletonLine className="w-16" />
        <div className="h-11 w-56 animate-pulse rounded bg-surface-raised" />
        <SkeletonLine className="w-72" />
        <div className="mt-2 h-1.5 w-full max-w-sm animate-pulse rounded-full bg-surface-raised" />
      </div>
      <div className="flex flex-col gap-12">
        {Array.from({ length: 2 }).map((_, group) => (
          <div key={group}>
            <div className="mb-5 border-b border-border pb-2.5">
              <SkeletonLine className="w-28" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-border p-3"
                >
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-raised" />
                  <div className="flex-1 space-y-2">
                    <SkeletonLine className="w-2/3" />
                    <SkeletonLine className="w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
