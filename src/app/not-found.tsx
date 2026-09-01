import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-gray-600">
        We couldn&rsquo;t find what you were looking for.
      </p>
      <Link href="/search" className="rounded bg-black px-4 py-2 text-white">
        Search music
      </Link>
    </main>
  );
}
