export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-8 flex flex-col gap-6 sm:flex-row">
        <div className="aspect-square w-full shrink-0 animate-pulse rounded bg-gray-200 sm:w-56" />
        <div className="flex flex-col gap-3">
          <div className="h-9 w-56 animate-pulse rounded bg-gray-200" />
          <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
      <div className="mb-3 h-6 w-24 animate-pulse rounded bg-gray-200" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-gray-200" />
        ))}
      </div>
    </main>
  );
}
