"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { rate, removeRating } from "@/app/ratings/actions";
import type { StackAlbum } from "@/lib/stack";
import { coverSrc } from "@/lib/cover-url";
import { useBadgeUnlock } from "@/components/BadgeUnlock";
import { ButtonLink, buttonClass } from "@/components/ui";
import { PlayButton, PreviewCredit } from "@/components/PreviewPlayer";
import { haptic } from "@/lib/haptics";

/**
 * One record at a time, ten buttons, and a way past anything you haven't
 * heard.
 *
 * A grid makes you aim twice — once at the cover, once at a score. A single
 * card puts the scores in the same place every time, so after three or four
 * records the thumb stops looking. That's the difference between rating five
 * and rating forty, and forty is the number that makes the rest of MULO work.
 *
 * Every choice is felt: the card flies off (right with your score stamped on
 * it, left when you pass), the phone taps back, and the last move can be taken
 * back for a few seconds. Saving happens in the background; anything that
 * fails comes back at the end of the run rather than stopping it.
 */

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** How long the chance to take a move back stays on screen. */
const UNDO_MS = 5000;

type Move = {
  /** Where the card sat, to go back to. */
  index: number;
  album: StackAlbum;
  score: number | null;
  key: number;
};

type Ghost = { album: StackAlbum; score: number | null; key: number };

/** Three bars bouncing, like a record playing. */
function Equaliser() {
  return (
    <span aria-hidden="true" className="flex h-2.5 items-end gap-[2px]">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="eq-bar w-[3px] rounded-sm bg-score-overall"
          style={{ "--at": `${bar * 0.18}s` } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

export default function StackDeck({
  albums,
  runId = 0,
  filters = "",
  finish,
}: {
  albums: StackAlbum[];
  /** Which run this is, so "Another run" can ask for the next one. */
  runId?: number;
  /** The run's decade and genre, as "&decade=1990&genre=rock", kept for "Another run". */
  filters?: string;
  /** Where a run that isn't The Stack goes when it's done, like a Gauntlet's ranking. */
  finish?: { href: string; label: string };
}) {
  /**
   * The run is fixed the moment it starts.
   *
   * Saving a rating is a server action, and a server action revalidates, which
   * makes Next.js render this page's server half again. `getStack` then leaves
   * out the record just rated, every record after it shifts up one, and the
   * card index — already moved on — lands a place further down the list than
   * it should. Keeping the deck in state means the list can't move under the
   * index. A fresh run picks up whatever has been rated since.
   */
  const [deck] = useState(albums);
  const [at, setAt] = useState(0);
  const [rated, setRated] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [, startTransition] = useTransition();
  const { celebrate, overlay } = useBadgeUnlock();

  // Saves still on their way, so an undo can wait for one to land before
  // taking it back — otherwise the removal could arrive first and the score
  // would stick.
  const pending = useRef(new Map<string, Promise<unknown>>());

  const album = deck[at];
  const done = at >= deck.length;

  const save = useCallback(
    (score: number) => {
      const target = deck[at];
      if (!target) return;

      haptic("select");
      setGhost({ album: target, score, key: Date.now() });
      setLastMove({ index: at, album: target, score, key: Date.now() });
      setRated((count) => count + 1);
      setAt((current) => current + 1);

      const saving = rate("album", target.mbid, score).then((result) => {
        if (!result.ok) {
          setRated((count) => count - 1);
          setFailed((list) => [...list, target.title]);
          return;
        }
        celebrate(result);
      });
      pending.current.set(target.mbid, saving);
    },
    [deck, at, celebrate],
  );

  const skip = useCallback(() => {
    const target = deck[at];
    if (!target) return;

    haptic("tap");
    setGhost({ album: target, score: null, key: Date.now() });
    setLastMove({ index: at, album: target, score: null, key: Date.now() });
    setSkipped((count) => count + 1);
    setAt((current) => current + 1);
  }, [deck, at]);

  const undo = useCallback(() => {
    const move = lastMove;
    if (!move) return;

    haptic("tap");
    setLastMove(null);
    setGhost(null);
    setAt(move.index);

    if (move.score === null) {
      setSkipped((count) => count - 1);
      return;
    }

    setRated((count) => count - 1);
    startTransition(async () => {
      await pending.current.get(move.album.mbid);
      await removeRating("album", move.album.mbid);
    });
  }, [lastMove]);

  // The chance to take a move back fades after a few seconds.
  useEffect(() => {
    if (!lastMove) return;
    const timer = setTimeout(() => setLastMove(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [lastMove]);

  // A number key rates, space skips, Z takes it back: on a laptop the whole
  // run is one hand.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Holding a key down repeats it, which would score several records at
      // once with a number the person only meant for one.
      if (event.repeat) return;

      if (event.key === "z" || event.key === "Z") {
        event.preventDefault();
        undo();
        return;
      }
      if (done) return;

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
  }, [done, save, skip, undo]);

  const undoToast = lastMove && (
    <div
      key={lastMove.key}
      role="status"
      className="stack-toast fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.25rem)] z-50 flex justify-center px-4"
    >
      <div className="flex items-center gap-4 rounded-full border border-border-strong bg-surface-raised/95 py-2 pl-4 pr-2 text-sm shadow-2xl backdrop-blur-xl">
        <span className="max-w-[12rem] truncate text-text-secondary">
          {lastMove.score === null ? (
            <>Passed on {lastMove.album.title}</>
          ) : (
            <>
              <span className="font-semibold text-score-you">{lastMove.score}</span>{" "}
              for {lastMove.album.title}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={undo}
          className="rounded-full bg-text px-3.5 py-1.5 text-xs font-semibold text-bg transition-transform active:scale-95"
        >
          Undo
        </button>
      </div>
    </div>
  );

  if (done) {
    return (
      <div className="stack-finish mx-auto max-w-lg py-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Run finished
        </p>
        <p className="display mt-3 text-6xl tabular-nums text-text sm:text-7xl">{rated}</p>
        <p className="mt-1 text-sm text-text-muted">
          {rated === 1 ? "record rated" : "records rated"}
        </p>
        <p className="mx-auto mt-4 max-w-sm text-sm text-text-secondary">
          {rated === 0
            ? "Nothing this time. There'll be a fresh run whenever you want one."
            : "Every one of those counts towards the scores everybody else sees."}
          {skipped > 0 && ` ${skipped} put back for another day.`}
        </p>

        {failed.length > 0 && (
          <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
            {failed.length === 1 ? `${failed[0]} didn't save.` : `${failed.length} didn't save.`}{" "}
            Worth trying those again.
          </p>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {/* A plain link back to /stack goes nowhere: it's the address we're
              already at. A new value moves us on. */}
          {finish ? (
            <ButtonLink href={finish.href}>{finish.label}</ButtonLink>
          ) : (
            <>
              <ButtonLink href={`/stack?run=${runId + 1}${filters}`}>Another run</ButtonLink>
              <ButtonLink href="/charts" variant="secondary">
                See the charts
              </ButtonLink>
            </>
          )}
        </div>
        {undoToast}
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

      {album.reason && (
        <p
          key={`${album.mbid}-reason`}
          className="stack-rise mt-3 text-center text-[11px] uppercase tracking-[0.14em] text-text-muted"
        >
          {album.reason}
        </p>
      )}

      {/* The cover, with the previous one flying off over the top of it */}
      <div className="relative mt-3 aspect-square w-full max-w-[12rem] sm:mt-5 sm:max-w-[16rem]">
        <div
          key={album.mbid}
          className="stack-cover artwork h-full w-full overflow-hidden rounded-xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]"
        >
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={album.title} className="h-full w-full object-cover" />
          )}
        </div>

        {ghost && (
          <div
            key={ghost.key}
            aria-hidden="true"
            onAnimationEnd={() => setGhost(null)}
            className={`pointer-events-none absolute inset-0 z-10 ${
              ghost.score === null ? "stack-fly-left" : "stack-fly-right"
            }`}
          >
            <div className="artwork h-full w-full overflow-hidden rounded-xl shadow-2xl">
              {ghost.album.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverSrc(ghost.album.cover, 500) ?? undefined}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            {ghost.score !== null ? (
              <span className="stack-stamp absolute -right-3 -top-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-score-you bg-bg/90 text-2xl font-bold tabular-nums text-score-you shadow-xl">
                {ghost.score}
              </span>
            ) : (
              <span className="stack-stamp absolute -left-3 -top-3 rounded-full border border-border-strong bg-bg/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted shadow-xl">
                Pass
              </span>
            )}
          </div>
        )}
      </div>

      <div key={`${album.mbid}-title`} className="stack-rise mt-4 w-full text-center">
        <Link
          href={`/album/${album.mbid}`}
          className="display-sm text-xl text-text transition-colors hover:text-accent sm:text-2xl"
        >
          {album.title}
        </Link>
        <p className="mt-1 text-sm text-text-secondary">
          {[album.artist, album.year].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* The songs people know this record by, each with a bar for how much
          it's played next to the biggest one. A cover and a title often aren't
          enough to place a record; one song you know and you can score it
          honestly rather than guessing or waving it off. */}
      {album.hits.length > 0 && (
        <div key={`${album.mbid}-hits`} className="mt-4 w-full">
          <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            <span className="flex items-center gap-2">
              {album.hitsByPlays && <Equaliser />}
              {album.hitsByPlays ? "Hits from this album" : "Opening tracks"}
            </span>
            {album.hitsByPlays && <span className="font-medium normal-case tracking-normal">by plays</span>}
          </div>
          <ol className="flex flex-col gap-1">
            {album.hits.map((hit, i) => (
              <li
                key={`${hit.title}-${i}`}
                className="stack-hit relative flex items-center gap-2.5 overflow-hidden rounded-lg border border-border/60 bg-surface/40 px-2.5 py-1.5"
                style={{ "--at": `${0.15 + i * 0.08}s` } as React.CSSProperties}
              >
                {album.hitsByPlays && (
                  <span
                    aria-hidden="true"
                    className={`stack-hit-bar absolute inset-y-0 left-0 origin-left ${
                      i === 0 ? "bg-score-overall/20" : "bg-score-overall/[0.09]"
                    }`}
                    style={{ width: `${Math.max(hit.share * 100, 8)}%` }}
                  />
                )}
                <span className="relative w-3 text-center text-[11px] font-bold tabular-nums text-score-overall">
                  {i + 1}
                </span>
                <span className="relative min-w-0 flex-1 truncate text-[13px] text-text">
                  {hit.title}
                </span>
                {i === 0 && album.hitsByPlays && (
                  <span className="relative shrink-0 text-[9px] font-semibold uppercase tracking-wider text-score-overall">
                    Biggest
                  </span>
                )}
                {album.artist && (
                  <PlayButton artist={album.artist} title={hit.title} scope={album.mbid} className="h-6 w-6 bg-bg/60" />
                )}
              </li>
            ))}
          </ol>
          {album.artist && <PreviewCredit scope={album.mbid} className="mt-1.5 justify-center" />}
        </div>
      )}

      {/* The undo sits at the top of the screen rather than the bottom: down
          there it covered the lower row of scores just when the next one was
          about to be tapped. */}
      {/* Ten targets in one place, so the thumb stops having to aim */}
      <div className="mt-4 grid w-full grid-cols-5 gap-2 sm:mt-5">
        {SCORES.map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => save(score)}
            className="flex h-12 items-center justify-center rounded-lg border border-border bg-surface text-base font-semibold tabular-nums text-text transition-[color,background-color,border-color,transform] duration-150 hover:border-score-you/60 hover:bg-score-you/10 hover:text-score-you active:scale-[0.9] active:bg-score-you active:text-bg sm:h-11"
          >
            {score}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={skip}
        className={`${buttonClass({ variant: "ghost" })} mt-2 w-full`}
      >
        Haven&rsquo;t heard it
      </button>

      <p className="mt-3 hidden text-center text-[11px] text-text-muted sm:block">
        Press 1&ndash;9, or 0 for ten. Space to pass, Z to undo.
      </p>

      {undoToast}
      {overlay}
    </div>
  );
}
