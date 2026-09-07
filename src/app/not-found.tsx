import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="display text-2xl text-text">Page not found</h1>
      <p className="text-sm text-text-secondary">
        We couldn&rsquo;t find what you were looking for.
      </p>
      <Link
        href="/search"
        className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-[#0b0b0e] transition-colors hover:bg-accent-hover"
      >
        Search music
      </Link>
    </main>
  );
}
