"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { rate } from "@/app/ratings/actions";
import { useBadgeUnlock } from "@/components/BadgeUnlock";
import { buttonClass } from "@/components/ui";

export type QuickRateItem = {
  mbid: string;
  title: string;
  subtitle: string | null;
  /** A ready-sized image address, or null for none. */
  image: string | null;
};

type Kind = "artist" | "album";

/**
 * Five was too few. A rating site runs on the weight of its ratings, and five
 * each across a few hundred people leaves nearly every record sitting on one
 * opinion. Ten is still well under a minute of tapping, and The Stack is there
 * afterwards for anyone with more in them.
 */
const GOAL = 10;

/**
 * Artists and albums a new person is likely to know, in two tabs. Tap one to
 * open its scores, tap a score to save it. Each rating shows straight away
 * and rolls back if the save fails.
 */
export default function QuickRateGrid({
  artists,
  albums,
  initialScores,
}: {
  artists: QuickRateItem[];
  albums: QuickRateItem[];
  /** Keyed "artist:<mbid>" or "album:<mbid>". */
  initialScores: Record<string, number>;
}) {
  const [tab, setTab] = useState<Kind>("artist");
  const [scores, setScores] = useState(initialScores);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { celebrate, overlay } = useBadgeUnlock();

  function save(kind: Kind, mbid: string, value: number) {
    const key = `${kind}:${mbid}`;
    const previous = scores[key];
    setScores((current) => ({ ...current, [key]: value }));
    setOpen(null);
    setError(null);

    startTransition(async () => {
      const result = await rate(kind, mbid, value);
      if (!result.ok) {
        setScores((current) => {
          const next = { ...current };
          if (previous === undefined) delete next[key];
          else next[key] = previous;
          return next;
        });
        setError(result.error);
      } else {
        celebrate(result);
      }
    });
  }

  const count = Object.keys(scores).length;
  const progress =
    count === 0
      ? "Tap an artist or album to rate it."
      : count < GOAL
        ? `${count} rated · ${GOAL - count} more to go`
        : `${count} rated · that's plenty to start`;

  const items = tab === "artist" ? artists : albums;
  const round = tab === "artist";

  return (
    <>
      <div
        role="tablist"
        aria-label="What to rate"
        className="mb-7 flex gap-1 rounded-lg border border-border bg-surface p-1 sm:w-fit"
      >
        {(["artist", "album"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={tab === kind}
            onClick={() => {
              setTab(kind);
              setOpen(null);
            }}
            className={`flex-1 rounded-md px-5 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
              tab === kind ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"
            }`}
          >
            {kind === "artist" ? "Artists" : "Albums"}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 pb-28 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item, i) => {
          const key = `${tab}:${item.mbid}`;
          const score = scores[key];
          const isOpen = open === key;

          return (
            <li key={key}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  aria-label={`Rate ${item.title}`}
                  className={`artwork relative block aspect-square w-full overflow-hidden transition-transform active:scale-[0.98] ${
                    round ? "rounded-full" : "rounded-lg"
                  }`}
                >
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt=""
                      loading={i < 10 ? "eager" : "lazy"}
                      className={`h-full w-full object-cover transition-opacity ${
                        round ? "object-top" : ""
                      } ${isOpen ? "opacity-25" : ""}`}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-text-muted">
                      {item.title.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {score !== undefined && !isOpen && (
                    <span
                      className={`absolute rounded-md bg-score-you px-2 py-0.5 text-sm font-bold tabular-nums text-[#0b0b0e] shadow-lg ${
                        round ? "bottom-2 left-1/2 -translate-x-1/2" : "right-2 top-2"
                      }`}
                    >
                      {score}
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div
                    role="group"
                    aria-label={`Score for ${item.title}`}
                    className="absolute inset-0 grid grid-cols-5 content-center gap-1.5 p-2.5"
                  >
                    {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => save(tab, item.mbid, n)}
                        aria-pressed={score === n}
                        className={`aspect-square rounded-md text-sm font-semibold tabular-nums transition-colors ${
                          score === n
                            ? "bg-score-you text-[#0b0b0e]"
                            : "bg-bg/85 text-text hover:bg-surface-hover"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p
                className={`display-sm mt-2 line-clamp-1 text-sm text-text ${
                  round ? "text-center" : ""
                }`}
              >
                {item.title}
              </p>
              {item.subtitle && (
                <p className="truncate text-xs text-text-muted">{item.subtitle}</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <p className="text-sm text-text-secondary" aria-live="polite">
            {error ? <span className="text-score-you">{error}</span> : progress}
          </p>
          <Link
            href="/welcome?step=follow"
            className={buttonClass({ variant: count === 0 ? "secondary" : "primary" })}
          >
            {count === 0 ? "Skip for now" : "Continue"}
          </Link>
        </div>
      </div>

      {overlay}
    </>
  );
}
