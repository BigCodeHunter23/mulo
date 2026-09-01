export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-8 h-9 w-64 animate-pulse rounded bg-gray-200" />
      <div className="mb-4 h-6 w-32 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="aspect-square animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </main>
  );
}
