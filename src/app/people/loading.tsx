import { SkeletonHeading, SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <SkeletonHeading className="mb-6 w-52" />
      <ul className="divide-y divide-gray-200 rounded border border-gray-200">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex items-center justify-between gap-4 px-4 py-4">
            <div className="flex-1 space-y-2">
              <SkeletonLine className="w-32" />
              <SkeletonLine className="w-20" />
            </div>
            <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
          </li>
        ))}
      </ul>
    </main>
  );
}
