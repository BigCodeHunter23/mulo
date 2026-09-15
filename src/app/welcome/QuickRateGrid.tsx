"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { rateAlbum } from "@/app/album/[mbid]/actions";
import type { AlbumSummary } from "@/lib/discover";
import { coverSrc } from "@/lib/cover-url";
import { buttonClass } from "@/components/ui";

const GOAL = 5;

/**
 * Tap a cover to open its scores, tap a score to save it. Each rating is
 * shown straight away and rolls back if the save fails.
 */
export default function QuickRateGrid({
  albums,
  initialScores,
}: {
  albums: AlbumSummary[];
  initialScores: Record<string, number>;
}) {
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function rate(mbid: string, value: number) {
    const previous = scores[mbid];
    setScores((current) => ({ ...current, [mbid]: value }));
    setOpen(null);
    setError(null);

    startTransition(async () => {
      const result = await rateAlbum(mbid, value);
      if (!result.ok) {
        setScores((current) => {
          const next = { ...current };
          if (previous === undefined) delete next[mbid];
          else next[mbid] = previous;
          return next;
        });
        setError(result.error);
      }
    });
  }

  const count = Object.keys(scores).length;
  const progress =
    count === 0
      ? "Tap an album to rate it."
      : count < GOAL
        ? `${count} rated · ${GOAL - count} more to go`
        : `${count} rated · you're set`;

  return (
    <>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 pb-28 sm:grid-cols-3 lg:grid-cols-5">
        {albums.map((album, i) => {
          const score = scores[album.mbid];
          const isOpen = open === album.mbid;
          const src = coverSrc(album.cover_art_url, 250);

          return (
            <li key={album.mbid}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : album.mbid)}
                  aria-expanded={isOpen}
                  aria-label={`Rate ${album.title}`}
                  className="artwork relative block aspect-square w-full overflow-hidden rounded-lg transition-transform active:scale-[0.98]"
                >
                  {src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt=""
                      loading={i < 10 ? "eager" : "lazy"}
                      className={`h-full w-full object-cover transition-opacity ${
                        isOpen ? "opacity-25" : ""
                      }`}
                    />
                  )}
                  {score !== undefined && !isOpen && (
                    <span className="absolute right-2 top-2 rounded-md bg-score-you px-2 py-0.5 text-sm font-bold tabular-nums text-[#0b0b0e] shadow-lg">
                      {score}
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div
                    role="group"
                    aria-label={`Score for ${album.title}`}
                    className="absolute inset-0 grid grid-cols-5 content-center gap-1.5 p-2.5"
                  >
                    {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => rate(album.mbid, n)}
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

              <p className="display-sm mt-2 line-clamp-1 text-sm text-text">
                {album.title}
              </p>
              <p className="truncate text-xs text-text-muted">{album.artist}</p>
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
    </>
  );
}
