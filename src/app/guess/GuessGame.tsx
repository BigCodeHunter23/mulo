"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GuessAlbum } from "@/lib/guess";
import { coverSrc } from "@/lib/cover-url";
import { Sparks } from "@/components/Celebrate";
import { ButtonLink, buttonClass } from "@/components/ui";

/**
 * Ten records, one slider each. Guess what everyone on MULO gave it, lock it
 * in, and watch the real score count up to where it landed.
 *
 * Scoring is kind at the edges and sharp in the middle: dead on is 100, a
 * point out is 80, five points out is nothing. Within three tenths counts as a
 * bullseye, and bullseyes throw sparks.
 */

const BEST_KEY = "mulo:guess-best";
const BULLSEYE = 0.3;

function pointsFor(guess: number, answer: number) {
  return Math.max(0, Math.round(100 - Math.abs(guess - answer) * 20));
}

/** What a final total says about you. */
function verdict(total: number, rounds: number) {
  const share = total / (rounds * 100);
  if (share >= 0.9) return "Mind reader. You know this crowd better than it knows itself.";
  if (share >= 0.75) return "Locked in. You've got a feel for the room.";
  if (share >= 0.55) return "Decent ears. The crowd surprised you a few times.";
  if (share >= 0.35) return "You and MULO don't always hear it the same way.";
  return "Contrarian. Which makes your own ratings worth reading.";
}

function readBest(): number | null {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

/** A number that counts up from where you guessed to where it really is. */
function CountTo({
  from,
  to,
  decimals = 1,
}: {
  from: number;
  to: number;
  decimals?: number;
}) {
  const [value, setValue] = useState(from);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, to]);

  return <>{value.toFixed(decimals)}</>;
}

export default function GuessGame({
  albums,
  gameId = 0,
}: {
  albums: GuessAlbum[];
  /** Which game this is, so "Play again" can ask for the next one. */
  gameId?: number;
}) {
  const [round, setRound] = useState(0);
  const [guess, setGuess] = useState(6.5);
  const [locked, setLocked] = useState(false);
  const [total, setTotal] = useState(0);
  const [bullseyes, setBullseyes] = useState(0);
  // Read once, when the game starts; a new best is written when it ends.
  const [best] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readBest(),
  );

  const album = albums[round];
  const done = round >= albums.length;

  // Record a new best the moment a game ends.
  useEffect(() => {
    if (!done) return;
    const previous = readBest();
    if (previous === null || total > previous) {
      try {
        window.localStorage.setItem(BEST_KEY, String(total));
      } catch {
        // Storage off: no memory of a best, which is fine.
      }
    }
  }, [done, total]);

  function lockIn() {
    if (!album || locked) return;
    setLocked(true);
    setTotal((sum) => sum + pointsFor(guess, album.score));
    if (Math.abs(guess - album.score) <= BULLSEYE) setBullseyes((n) => n + 1);
    try {
      navigator.vibrate?.(15);
    } catch {
      // Not supported.
    }
  }

  function next() {
    setRound((r) => r + 1);
    setGuess(6.5);
    setLocked(false);
  }

  if (albums.length === 0) {
    return (
      <p className="text-center text-sm text-text-secondary">
        Not enough scored records to play with yet. Rate a few and come back.
      </p>
    );
  }

  if (done) {
    const newBest = best === null || total > best;
    return (
      <div className="guess-finish mx-auto max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Final score</p>
        <p className="display relative mt-3 text-7xl tabular-nums text-text">
          {newBest && total > 0 && <Sparks count={18} reach={120} delay={0.2} />}
          <CountTo from={0} to={total} decimals={0} />
        </p>
        <p className="mt-1 text-sm text-text-muted">
          out of {albums.length * 100}
          {bullseyes > 0 && ` · ${bullseyes} bullseye${bullseyes === 1 ? "" : "s"}`}
        </p>
        {newBest && total > 0 ? (
          <p className="mt-3 text-sm font-semibold text-score-overall">New personal best</p>
        ) : (
          best !== null && <p className="mt-3 text-sm text-text-muted">Your best: {best}</p>
        )}
        <p className="mx-auto mt-5 max-w-sm text-sm text-text-secondary">
          {verdict(total, albums.length)}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href={`/guess?game=${gameId + 1}`}>Play again</ButtonLink>
          <ButtonLink href="/stack" variant="secondary">
            Rate some yourself
          </ButtonLink>
        </div>
      </div>
    );
  }

  const cover = coverSrc(album.cover, 500);
  const points = pointsFor(guess, album.score);
  const bullseye = Math.abs(guess - album.score) <= BULLSEYE;
  // Where the real score sits on the slider track, for the reveal marker.
  const answerAt = ((album.score - 1) / 9) * 100;
  const guessAt = ((guess - 1) / 9) * 100;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center">
      <div className="flex w-full items-baseline justify-between text-xs text-text-muted">
        <span className="tabular-nums">
          Round {round + 1} of {albums.length}
        </span>
        <span className="tabular-nums">{total} points</span>
      </div>

      <div key={album.mbid} className="stack-cover artwork relative mt-5 aspect-square w-full max-w-[14rem] overflow-hidden rounded-xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] sm:max-w-[17rem]">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={album.title} className="h-full w-full object-cover" />
        )}
      </div>

      <div key={`${album.mbid}-t`} className="stack-rise mt-4 text-center">
        <p className="display-sm text-xl text-text">{album.title}</p>
        <p className="mt-0.5 text-sm text-text-secondary">
          {[album.artist, album.year].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* The guess, big, and the answer counting up to meet it */}
      <div className="relative mt-6 flex items-end justify-center gap-8">
        <div className="text-center">
          <p className="display text-5xl tabular-nums text-score-you">{guess.toFixed(1)}</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Your guess</p>
        </div>
        {locked && (
          <div className="guess-reveal relative text-center">
            {bullseye && <Sparks count={16} reach={90} delay={0.8} />}
            <p className="display text-5xl tabular-nums text-score-overall">
              <CountTo from={guess} to={album.score} />
            </p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Everyone</p>
          </div>
        )}
      </div>

      <div className="relative mt-6 w-full">
        <input
          type="range"
          min={1}
          max={10}
          step={0.1}
          value={guess}
          disabled={locked}
          onChange={(event) => setGuess(Number(event.target.value))}
          aria-label="Your guess at everyone's score"
          className="guess-slider w-full"
          style={{ "--fill": `${guessAt}%` } as React.CSSProperties}
        />
        {locked && (
          <span
            aria-hidden="true"
            className="guess-answer absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-score-overall shadow-[0_0_12px_rgba(245,197,24,0.9)]"
            style={{ left: `${answerAt}%` }}
          />
        )}
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-text-muted">
          <span>1</span>
          <span>10</span>
        </div>
      </div>

      {locked ? (
        <div className="guess-reveal mt-5 w-full text-center">
          <p className={`text-sm font-semibold ${bullseye ? "text-score-overall" : "text-text"}`}>
            {bullseye ? "Bullseye! " : ""}+{points} points
          </p>
          <div className="mt-4 flex gap-3">
            <Link href={`/album/${album.mbid}`} className={`${buttonClass({ variant: "secondary" })} flex-1`}>
              Rate it
            </Link>
            <button type="button" onClick={next} autoFocus className={`${buttonClass()} flex-1`}>
              {round + 1 < albums.length ? "Next record" : "See your score"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={lockIn} className={`${buttonClass()} mt-6 w-full`}>
          Lock it in
        </button>
      )}
    </div>
  );
}
