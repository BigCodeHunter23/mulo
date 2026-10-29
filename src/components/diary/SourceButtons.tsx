"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeDiarySource, startLastfm } from "@/app/diary/actions";
import { SOURCE_NAME, type ImportSource } from "@/lib/diary-shared";
import { buttonClass } from "@/components/ui";

const quiet =
  "text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline";

function Problem({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="mt-2 text-xs text-error-soft">
      {text}
    </p>
  ) : null;
}

/** Connect Last.fm, or connect it again: off to Last.fm's approval page. */
export function ConnectLastfm({ again = false }: { again?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function connect() {
    setError(null);
    startTransition(async () => {
      // On its way, the action leaves for Last.fm; it only answers when it can't.
      const result = await startLastfm();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={connect}
        disabled={pending}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        {pending ? "Opening Last.fm…" : again ? "Reconnect Last.fm" : "Connect Last.fm"}
      </button>
      <Problem text={error} />
    </div>
  );
}

/**
 * Disconnect Last.fm, asking whether to keep what it added; or remove an
 * import (Spotify, Apple Music) and everything it added, after a confirm.
 */
export function RemoveSource({ source }: { source: ImportSource }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = SOURCE_NAME[source];

  function remove(keep: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await removeDiarySource(source, keep);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAsking(false);
      router.refresh();
    });
  }

  if (source !== "lastfm") {
    return (
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Remove everything from ${name}? It leaves your diary.`)) {
              remove(false);
            }
          }}
          className={quiet}
        >
          {pending ? "Removing…" : `Remove everything from ${name}`}
        </button>
        <Problem text={error} />
      </div>
    );
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={quiet}>
        Disconnect
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3">
      <p className="text-sm text-text-secondary">Keep the albums Last.fm added?</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => remove(true)}
          disabled={pending}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          Keep them
        </button>
        <button
          type="button"
          onClick={() => remove(false)}
          disabled={pending}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          Delete them
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          disabled={pending}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          Cancel
        </button>
      </div>
      <Problem text={error} />
    </div>
  );
}
