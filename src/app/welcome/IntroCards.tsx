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

function CrownArt() {
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="h-8 w-8 text-score-overall">
        <path d="M3 18h18l1.2-10.2-5.1 3.4L12 3.6 6.9 11.2 1.8 7.8 3 18zm0 2v1.2h18V20H3z" />
      </svg>
      <div className="goat-crown mt-2 flex h-24 w-24 items-center justify-center rounded-full bg-surface ring-2 ring-score-overall">
        <span className="display text-4xl text-score-overall">1</span>
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

const CARDS = [
  {
    title: "Rate everything",
    body: "Albums, artists, even single songs, out of ten. Every score shows three ways: everyone's, yours, and your friends'.",
    art: <ScoresArt />,
  },
  {
    title: "Crown your GOAT",
    body: "Rank your top ten artists and albums. Number one wears the crown, right at the top of your profile.",
    art: <CrownArt />,
  },
  {
    title: "Bring your people",
    body: "Follow friends, see their scores next to yours, and find out exactly where you disagree.",
    art: <PeopleArt />,
  },
  {
    title: "Settle the debate",
    body: "Which album is actually the best? Every rating counts towards the answer, and there's a new Versus to pick every day.",
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
