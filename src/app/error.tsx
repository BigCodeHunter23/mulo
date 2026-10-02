"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui";

/**
 * Shown when a page fails to load. "Try again" fetches the page afresh,
 * which is usually all a passing hiccup needs. The reference matches the
 * error in Vercel's logs, should somebody report it.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[page] failed to load:", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="display text-2xl text-text">Something went wrong</h1>
      <p className="text-sm text-text-secondary">
        This page didn&rsquo;t load. Trying again usually fixes it.
      </p>
      <button type="button" onClick={() => retry()} className={buttonClass()}>
        Try again
      </button>
      {error.digest && (
        <p className="text-xs text-text-muted">Reference: {error.digest}</p>
      )}
    </main>
  );
}
