"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "@/components/StarScore";
import { buttonClass } from "@/components/ui";
import Portal from "@/components/Portal";

function ScoresArt() {
  const scores = [
    { label: "Everyone", value: "8.7", color: "text-score-overall" },
    { label: "You", value: "9", color: "text-score-you" },
    { label: "Friends", value: "8.2", color: "text-score-friends" },
  ];

  return (
    <div className="flex gap-7">
      {scores.map((score) => (
        <div key={score.label} className="flex flex-col items-center gap-1">
          <Star className={`h-9 w-9 ${score.color}`} />
          <span className="display-sm text-lg tabular-nums text-text">{score.value}</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">
            {score.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A card off the top of the deck, mid-score: the Stack in one picture. */
function StackArt() {
  return (
    <div className="relative flex h-28 w-32 items-center justify-center">
      <div className="absolute h-24 w-24 -rotate-6 rounded-xl border border-border bg-surface-raised" />
      <div className="absolute h-24 w-24 rotate-3 rounded-xl border border-border bg-surface" />
      <div className="relative flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-border-strong bg-surface shadow-lg">
        <Star className="h-7 w-7 text-score-you" />
        <span className="display-sm text-lg tabular-nums text-text">9</span>
      </div>
    </div>
  );
}

function PeopleArt() {
  const people = ["S", "A", "J"];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex">
        {people.map((initial, i) => (
          <span
            key={initial}
            className="-ml-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface text-lg font-semibold text-text-secondary ring-4 ring-surface-raised first:ml-0"
            style={{ zIndex: people.length - i }}
          >
            {initial}
          </span>
        ))}
      </div>
      <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
        <span className="font-semibold text-accent">87%</span> taste match
      </span>
    </div>
  );
}

function DebateArt() {
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <span className="h-20 w-20 rounded-lg bg-gradient-to-br from-accent/70 to-score-you/60" />
        <span className="display-sm text-sm tabular-nums text-score-overall">9.1</span>
      </div>
      <span className="display text-lg text-text-muted">vs</span>
      <div className="flex flex-col items-center gap-2">
        <span className="h-20 w-20 rounded-lg bg-gradient-to-br from-score-friends/70 to-surface" />
        <span className="display-sm text-sm tabular-nums text-score-overall">8.8</span>
      </div>
    </div>
  );
}

/**
 * Four cards, in the order somebody actually needs them: what this is, how
 * you use it, what other people add, and why you'd open it again tomorrow.
 * One idea each.
 *
 * The old opening card explained that every score shows three ways —
 * machinery nobody needs before they have rated a single thing, and the part
 * people said was confusing. It earns its place on an album page, not here.
 */
const CARDS = [
  {
    title: "Every record, out of ten",
    body: "Albums, artists, songs — score anything. Yours sits next to everyone else's, so you can see who's with you and who has lost it.",
    art: <ScoresArt />,
  },
  {
    title: "Ten albums, two minutes",
    body: "The Stack deals you records you'll know, one at a time, with the tracklist and a thirty-second preview to jog your memory. Tap a score, next.",
    art: <StackArt />,
  },
  {
    title: "Argue with your friends",
    body: "Follow people and go head to head: how close your taste really is, and the record you gave a 9 that they gave a 3.",
    art: <PeopleArt />,
  },
  {
    title: "Something new every day",
    body: "One album everybody rates together each week, one matchup to settle every day. There's always something waiting when you come back.",
    art: <DebateArt />,
  },
];

/**
 * Four quick cards for a brand new account: what MULO is and why it's worth
 * the next minute. Shown once, straight after signing up. Tap through, swipe,
 * or skip.
 */
export default function IntroCards() {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const primary = useRef<HTMLButtonElement>(null);
  const swipeFrom = useRef<number | null>(null);

  const last = index === CARDS.length - 1;

  useEffect(() => {
    if (!open) return;
    primary.current?.focus();
  }, [open, index]);

  useEffect(() => {
    if (!open) return;

    // Keep the page behind still while the cards are up.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        window.history.replaceState(null, "", "/welcome");
      }
      if (event.key === "ArrowRight") setIndex((i) => Math.min(CARDS.length - 1, i + 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    }

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  function close() {
    setOpen(false);
    // Drop ?intro=1, so refreshing doesn't bring the cards back.
    window.history.replaceState(null, "", "/welcome");
  }

  const card = CARDS[index];

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        className="fixed inset-0 z-[60] flex items-end justify-center bg-bg/80 p-4 backdrop-blur-sm sm:items-center"
      >
        <div
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
          onPointerDown={(event) => {
            swipeFrom.current = event.clientX;
          }}
          onPointerUp={(event) => {
            const from = swipeFrom.current;
            swipeFrom.current = null;
            if (from === null) return;
            const distance = event.clientX - from;
            if (distance < -50) setIndex((i) => Math.min(CARDS.length - 1, i + 1));
            if (distance > 50) setIndex((i) => Math.max(0, i - 1));
          }}
        >
          <div key={`art-${index}`} className="goat-reveal flex h-48 items-center justify-center bg-surface-raised">
            {card.art}
          </div>

          <div key={`text-${index}`} className="goat-reveal p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-muted">
              {index + 1} of {CARDS.length}
            </p>
            <h2 id="intro-title" className="display mt-2 text-2xl text-text">
              {card.title}
            </h2>
            <p className="mt-2 min-h-[4.5rem] text-sm leading-relaxed text-text-secondary">
              {card.body}
            </p>

            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="flex gap-1.5" aria-hidden="true">
                {CARDS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? "w-5 bg-accent" : "w-1.5 bg-border-strong"
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-4">
                {!last && (
                  <button
                    type="button"
                    onClick={close}
                    className="text-xs text-text-muted transition-colors hover:text-text"
                  >
                    Skip
                  </button>
                )}
                <button
                  ref={primary}
                  type="button"
                  onClick={() => (last ? close() : setIndex(index + 1))}
                  className={buttonClass({ size: "sm" })}
                >
                  {last ? "Let's go" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
