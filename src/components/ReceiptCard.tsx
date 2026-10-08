"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { rate } from "@/app/ratings/actions";
import { coverSrc } from "@/lib/cover-url";
import type { Receipt } from "@/lib/receipts";
import { useBadgeUnlock } from "@/components/BadgeUnlock";
import { buttonClass } from "@/components/ui";
import { haptic } from "@/lib/haptics";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * An old score, put back in front of somebody.
 *
 * Standing by it counts as rating it again, which is what takes it out of the
 * running — so "still a 9" and "make it a 7" are the same save, and nothing
 * has to remember the question was asked.
 */
export default function ReceiptCard({
  receipt,
  howLongAgo,
}: {
  receipt: Receipt;
  /** Worked out on the server, so it reads the same before and after hydration. */
  howLongAgo: string;
}) {
  const [done, setDone] = useState<number | null>(null);
  const [changing, setChanging] = useState(false);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { celebrate, overlay } = useBadgeUnlock();

  if (gone) return null;

  const cover = coverSrc(receipt.cover_art_url, 250);

  function save(score: number) {
    haptic("select");
    setError(null);
    startTransition(async () => {
      const result = await rate("album", receipt.mbid, score);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      celebrate(result);
      setDone(score);
      setChanging(false);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        Receipts
      </p>

      <div className="mt-3 flex items-center gap-4">
        <Link href={`/album/${receipt.mbid}`} className="shrink-0">
          <span className="artwork block h-16 w-16 overflow-hidden rounded-lg bg-surface-raised sm:h-20 sm:w-20">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="h-full w-full object-cover" />
            )}
          </span>
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={`/album/${receipt.mbid}`}
            className="display-sm block truncate text-base text-text transition-colors hover:text-accent"
          >
            {receipt.title}
          </Link>
          {receipt.artist && (
            <p className="truncate text-sm text-text-secondary">{receipt.artist}</p>
          )}
          <p className="mt-1 text-sm text-text-secondary">
            You gave it{" "}
            <span className="font-semibold tabular-nums text-score-you">{receipt.score}</span>{" "}
            {howLongAgo}
            {receipt.everyone !== null && (
              <>
                {" "}
                · everyone else says{" "}
                <span className="font-semibold tabular-nums text-score-overall">
                  {receipt.everyone.toFixed(1)}
                </span>
              </>
            )}
            .
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-error-soft">
          {error}
        </p>
      )}

      {done !== null ? (
        <p className="mt-4 text-sm text-text-secondary">
          {done === receipt.score ? (
            <>Still a {done}. Noted.</>
          ) : (
            <>
              Changed to <span className="font-semibold text-score-you">{done}</span>.
            </>
          )}
        </p>
      ) : changing ? (
        <div className="mt-4">
          <div
            role="group"
            aria-label={`Your new score for ${receipt.title}`}
            className="grid grid-cols-5 gap-1.5 sm:grid-cols-10"
          >
            {SCORES.map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => save(score)}
                disabled={pending}
                className={`h-10 rounded-lg border text-sm font-semibold tabular-nums transition-all active:scale-95 ${
                  score === receipt.score
                    ? "border-score-you text-score-you"
                    : "border-border bg-surface-raised text-text-secondary hover:border-border-strong hover:text-text"
                }`}
              >
                {score}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setChanging(false)}
            className="mt-3 text-xs text-text-muted underline-offset-4 hover:text-text hover:underline"
          >
            Leave it
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save(receipt.score)}
            disabled={pending}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            {pending ? "Saving…" : `Still a ${receipt.score}`}
          </button>
          <button
            type="button"
            onClick={() => setChanging(true)}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Change it
          </button>
          <button
            type="button"
            onClick={() => setGone(true)}
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            Not now
          </button>
        </div>
      )}

      {overlay}
    </section>
  );
}
