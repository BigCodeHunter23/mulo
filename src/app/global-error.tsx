"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui";
import "./globals.css";

/**
 * The last resort, when the frame around every page (the header, or the
 * layout itself) fails. It stands in for the whole document, so it brings its
 * own <html> and <body>.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[layout] failed to load:", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-bg font-sans text-text">
        <title>Something went wrong · MULO</title>
        <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="display text-xl text-accent">MULO</p>
          <h1 className="display text-2xl text-text">Something went wrong</h1>
          <p className="text-sm text-text-secondary">
            MULO didn&rsquo;t load. Trying again usually fixes it.
          </p>
          <button type="button" onClick={() => retry()} className={buttonClass()}>
            Try again
          </button>
          {error.digest && (
            <p className="text-xs text-text-muted">Reference: {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
