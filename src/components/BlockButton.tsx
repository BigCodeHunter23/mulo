"use client";

import { useState, useTransition } from "react";
import { setBlocked } from "@/app/u/[username]/actions";
import { buttonClass } from "@/components/ui";
import { haptic } from "@/lib/haptics";

const quietLink =
  "text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline";

/**
 * Blocks somebody, after asking once.
 *
 * Kept as quiet as Report: a small link that only becomes a decision when
 * somebody means it. Blocking hides them from you and you from them, and
 * stops either of you following the other, so it says as much before doing
 * anything.
 */
export default function BlockButton({
  targetId,
  username,
  name,
  signedIn,
}: {
  targetId: string;
  username: string;
  /** What to call them while asking. */
  name: string;
  signedIn: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!signedIn) return null;

  function block() {
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await setBlocked(targetId, username, true);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAsking(false);
    });
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={quietLink}>
        Block
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-text-secondary">
        Block {name}? You won&rsquo;t see each other&rsquo;s scores or reviews, and whichever of you
        follows the other will stop.
      </p>
      {error && (
        <p role="alert" className="text-xs text-error-soft">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={block}
          disabled={pending}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          {pending ? "Blocking…" : "Block them"}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
