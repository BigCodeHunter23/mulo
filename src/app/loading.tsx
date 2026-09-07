import { SkeletonHeading, SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <SkeletonHeading className="mb-6 w-40" />
      <SkeletonRows count={4} />
    </main>
  );
}
