"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-gray-600">
        The music database may be busy. Trying again usually fixes it.
      </p>
      <button
        onClick={reset}
        className="rounded bg-black px-4 py-2 text-white"
      >
        Try again
      </button>
    </main>
  );
}
