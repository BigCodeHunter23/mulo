"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setReaction } from "@/app/reactions/actions";
import { haptic } from "@/lib/haptics";

type Kind = "album" | "artist" | "take" | "pick";

const NOUN: Record<Kind, string> = {
  album: "review",
  artist: "review",
  take: "take",
  pick: "pick",
};

type Summary = { love: number; dislike: number; mine: 1 | -1 | null };

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 20.4 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13z" />
    </svg>
  );
}

function ThumbDown({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M7 3h9.2a2 2 0 0 1 2 1.7l1 6A2 2 0 0 1 17.2 13H13l.9 3.6a2.4 2.4 0 0 1-4.3 2L7 13z" />
      <path d="M4 3h3v10H4z" />
    </svg>
  );
}

/**
 * Love or dislike somebody's review. One or the other, never both, and
 * tapping the same one again takes it back. The count moves at once and
 * rolls back if the save fails.
 */
export default function Reactions({
  kind,
  ratingId,
  summary,
  signedIn,
  readOnly = false,
}: {
  kind: Kind;
  ratingId: number;
  summary: Summary;
  signedIn: boolean;
  /** For your own ratings: the counts, with nothing to press. */
  readOnly?: boolean;
}) {
  const [state, setState] = useState(summary);
  const [, startTransition] = useTransition();

  function pick(value: 1 | -1) {
    haptic("tap");
    const previous = state;
    const mine = state.mine === value ? 0 : value;

    setState({
      love: state.love - (state.mine === 1 ? 1 : 0) + (mine === 1 ? 1 : 0),
      dislike: state.dislike - (state.mine === -1 ? 1 : 0) + (mine === -1 ? 1 : 0),
      mine: mine === 0 ? null : mine,
    });

    startTransition(async () => {
      const result = await setReaction(kind, ratingId, mine);
      if (!result.ok) setState(previous);
    });
  }

  const base =
    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors";

  if (readOnly) {
    if (state.love === 0 && state.dislike === 0) return null;
    return (
      <div className="flex items-center gap-3 text-xs tabular-nums text-text-muted">
        {state.love > 0 && (
          <span className="flex items-center gap-1.5">
            <Heart filled />
            {state.love}
          </span>
        )}
        {state.dislike > 0 && (
          <span className="flex items-center gap-1.5">
            <ThumbDown filled />
            {state.dislike}
          </span>
        )}
      </div>
    );
  }

  if (!signedIn) {
    return (
      <Link
        href="/login"
        className={`${base} border-border text-text-muted hover:text-text`}
      >
        <Heart filled={false} />
        {state.love > 0 ? state.love : "Love"}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => pick(1)}
        aria-pressed={state.mine === 1}
        aria-label={`Love this ${NOUN[kind]}`}
        className={`${base} ${
          state.mine === 1
            ? "border-score-you/40 bg-score-you/10 text-score-you"
            : "border-border text-text-muted hover:border-border-strong hover:text-text"
        }`}
      >
        <Heart filled={state.mine === 1} />
        {state.love > 0 ? state.love : "Love"}
      </button>

      <button
        type="button"
        onClick={() => pick(-1)}
        aria-pressed={state.mine === -1}
        aria-label={`Disagree with this ${NOUN[kind]}`}
        className={`${base} ${
          state.mine === -1
            ? "border-score-friends/40 bg-score-friends/10 text-score-friends"
            : "border-border text-text-muted hover:border-border-strong hover:text-text"
        }`}
      >
        <ThumbDown filled={state.mine === -1} />
        {state.dislike > 0 ? state.dislike : "Nah"}
      </button>
    </div>
  );
}
