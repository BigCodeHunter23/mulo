import { SkeletonHeading, SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-8 h-10 animate-pulse rounded bg-gray-200" />
      <SkeletonHeading className="mb-4 w-28" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonLine key={i} className="w-full" />
        ))}
      </div>
    </main>
  );
}
