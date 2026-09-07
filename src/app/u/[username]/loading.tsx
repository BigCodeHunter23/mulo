import { SkeletonHeading, SkeletonLine, SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-8 space-y-3">
        <SkeletonHeading className="w-56" />
        <SkeletonLine className="w-32" />
        <SkeletonLine className="w-72" />
      </div>
      <SkeletonHeading className="mb-4 w-28" />
      <SkeletonRows count={3} />
    </main>
  );
}
