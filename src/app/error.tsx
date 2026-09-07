"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="display text-2xl text-text">Something went wrong</h1>
      <p className="text-sm text-text-secondary">
        The music database may be busy. Trying again usually fixes it.
      </p>
      <button
        onClick={reset}
        className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-[#0b0b0e] transition-colors hover:bg-accent-hover"
      >
        Try again
      </button>
    </main>
  );
}
