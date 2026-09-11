import { SkeletonHeading, SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <div className="mb-10 h-10 animate-pulse rounded-lg bg-surface-raised" />
      <SkeletonHeading className="mb-5 w-24" />
      <div className="overflow-hidden rounded-xl border border-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="border-b border-border px-4 py-3.5 last:border-b-0"
          >
            <SkeletonLine className="w-1/2" />
          </div>
        ))}
      </div>
    </main>
  );
}
