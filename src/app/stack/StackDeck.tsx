"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { rate } from "@/app/ratings/actions";
import type { StackAlbum } from "@/lib/stack";
import { coverSrc } from "@/lib/cover-url";
import { useBadgeUnlock } from "@/components/BadgeUnlock";
import { ButtonLink, buttonClass } from "@/components/ui";

/**
 * One record at a time, ten buttons, and a way past anything you haven't
 * heard.
 *
 * A grid makes you aim twice — once at the cover, once at a score. A single
 * card puts the scores in the same place every time, so after three or four
 * records the thumb stops looking. That's the difference between rating five
 * and rating forty, and forty is the number that makes the rest of MULO work.
 *
 * Saving happens in the background and the card moves on straight away.
 * Anything that fails to save comes back at the end of the run rather than
 * stopping it.
 */

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function StackDeck({
  albums,
  runId = 0,
}: {
  albums: StackAlbum[];
  /** Which run this is, so "Another run" can ask for the next one. */
  runId?: number;
}) {
  /**
   * The run is fixed the moment it starts.
   *
   * Saving a rating is a server action, and a server action revalidates, which
   * makes Next.js render this page's server half again. `getStack` then leaves
   * out the record just rated, every record after it shifts up one, and the
   * card index — already moved on — lands a place further down the list than
   * it should. The effect is that every second record gets stepped over
   * without being shown.
   *
   * Keeping the deck in state means the list can't move under the index. A
   * fresh run picks up whatever has been rated since.
   */
  const [deck] = useState(albums);
  const [at, setAt] = useState(0);
  const [rated, setRated] = useState(0);
  const [skipped, setSkipped] = useState<StackAlbum[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [, startTransition] = useTransition();
  const { celebrate, overlay } = useBadgeUnlock();

  const album = deck[at];
  const done = at >= deck.length;

  const next = useCallback(() => setAt((current) => current + 1), []);

  const save = useCallback(
    (score: number) => {
      const target = deck[at];
      if (!target) return;

      setRated((count) => count + 1);
      next();

      startTransition(async () => {
        const result = await rate("album", target.mbid, score);
        if (!result.ok) {
          setRated((count) => count - 1);
          setFailed((list) => [...list, target.title]);
          return;
        }
        celebrate(result);
      });
    },
    [deck, at, next, celebrate],
  );

  const skip = useCallback(() => {
    const target = deck[at];
    if (target) setSkipped((list) => [...list, target]);
    next();
  }, [deck, at, next]);

  // A number key rates, space skips: on a laptop the whole run is one hand.
  useEffect(() => {
    if (done) return;

    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Holding a key down repeats it, which would score several records at
      // once with a number the person only meant for one.
      if (event.repeat) return;

      if (event.key === "0") {
        event.preventDefault();
        save(10);
      } else if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        save(Number(event.key));
      } else if (event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        skip();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, save, skip]);

  if (done) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <p className="display text-4xl text-text sm:text-5xl">
          {rated} rated
        </p>
        <p className="mt-3 text-sm text-text-secondary">
          {rated === 0
            ? "Nothing this time. There'll be a fresh run whenever you want one."
            : "That's your scores in, and they count towards everyone else's too."}
          {skipped.length > 0 && ` ${skipped.length} put back for another day.`}
        </p>

        {failed.length > 0 && (
          <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
            {failed.length === 1
              ? `${failed[0]} didn't save.`
              : `${failed.length} didn't save.`}{" "}
            Worth trying those again.
          </p>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {/* A plain link back to /stack goes nowhere: it's the address we're
              already at, so nothing is built again and the finished screen
              stays put. A new value moves us on. */}
          <ButtonLink href={`/stack?run=${runId + 1}`}>Another run</ButtonLink>
          <ButtonLink href="/charts" variant="secondary">
            See the charts
          </ButtonLink>
        </div>
        {overlay}
      </div>
    );
  }

  const cover = coverSrc(album.cover, 500);
  const left = deck.length - at;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center">
      {/* How far through, so the run has an end in sight */}
      <div className="flex w-full items-baseline justify-between gap-3 text-xs text-text-muted">
        <span className="tabular-nums">{rated} rated</span>
        <span className="tabular-nums">{left} to go</span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-raised">
        <div
          className="h-full rounded-full bg-score-you transition-[width] duration-300"
          style={{ width: `${(at / deck.length) * 100}%` }}
        />
      </div>

      <div className="artwork mt-6 aspect-square w-full max-w-[19rem] overflow-hidden rounded-xl">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={album.mbid}
            src={cover}
            alt={album.title}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="mt-5 w-full text-center">
        <Link
          href={`/album/${album.mbid}`}
          className="display-sm text-xl text-text transition-colors hover:text-accent sm:text-2xl"
        >
          {album.title}
        </Link>
        <p className="mt-1 text-sm text-text-secondary">
          {[album.artist, album.year].filter(Boolean).join(" · ")}
        </p>
        {album.reason && (
          <p className="mt-2 text-xs text-text-muted">{album.reason}</p>
        )}
      </div>

      {/* Ten targets in one place, so the thumb stops having to aim */}
      <div className="mt-6 grid w-full grid-cols-5 gap-2">
        {SCORES.map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => save(score)}
            className="flex h-12 items-center justify-center rounded-lg border border-border bg-surface text-base font-semibold tabular-nums text-text transition-[color,background-color,border-color,transform] duration-150 hover:border-score-you/60 hover:bg-score-you/10 hover:text-score-you active:scale-[0.94] sm:h-11"
          >
            {score}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={skip}
        className={`${buttonClass({ variant: "ghost" })} mt-3 w-full`}
      >
        Haven&rsquo;t heard it
      </button>

      <p className="mt-4 hidden text-center text-[11px] text-text-muted sm:block">
        Press 1&ndash;9 or 0 for ten. Space to skip.
      </p>

      {overlay}
    </div>
  );
}
