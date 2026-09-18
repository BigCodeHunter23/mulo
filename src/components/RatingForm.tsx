"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  rate,
  removeRating,
  saveReview,
  type RatingResult,
} from "@/app/ratings/actions";
import { useBadgeUnlock } from "@/components/BadgeUnlock";
import { buttonClass, fieldClass } from "@/components/ui";

type Status =
  | { tone: "saved"; text: string }
  | { tone: "error"; text: string; needsProfile?: boolean }
  | null;

const COPY = {
  album: { noun: "album", prompt: "What did you make of it?" },
  artist: { noun: "artist", prompt: "What do you make of their music?" },
} as const;

/**
 * Rates an album or an artist. Tapping a score saves it straight away, with
 * no Save button and no reload. The score shows as chosen immediately and
 * rolls back if the save fails. A review is typed, so it gets an explicit
 * save that only appears once there's something new to save.
 */
/** How far from the crowd a score has to land to count as a hot take. */
const HOT_TAKE_GAP = 3;
/**
 * And how big a crowd it has to be against. One voice is enough: the crowd
 * includes the starting score, so on a quiet page it's the number on screen,
 * and a 1 against it is worth asking about.
 */
const HOT_TAKE_CROWD = 1;

export default function RatingForm({
  kind,
  mbid,
  signedIn,
  existing,
}: {
  kind: "album" | "artist";
  mbid: string;
  signedIn: boolean;
  existing: { score: number; review: string | null } | null;
}) {
  const [score, setScore] = useState<number | null>(existing?.score ?? null);
  const [savedReview, setSavedReview] = useState(existing?.review ?? "");
  const [draft, setDraft] = useState(existing?.review ?? "");
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const { celebrate, overlay } = useBadgeUnlock();
  /**
   * Set when a score lands a long way from everybody else's. Disagreement is
   * the most interesting thing on a rating site, and it's usually silent: a 3
   * against a crowd of 8s says something, but nobody learns what unless they're
   * asked. This asks, once, right when it's fresh.
   */
  const [hotTake, setHotTake] = useState<{ yours: number; crowd: number; count: number } | null>(null);
  const reviewBox = useRef<HTMLTextAreaElement>(null);

  // A success message fades after a moment; errors stay until acted on.
  useEffect(() => {
    if (status?.tone !== "saved") return;
    const timer = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  const { noun, prompt } = COPY[kind];

  if (!signedIn) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/40 px-5 py-6 text-center">
        <p className="text-sm text-text-secondary">
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Log in
          </Link>{" "}
          to rate and review this {noun}.
        </p>
      </div>
    );
  }

  function settle(result: RatingResult, success: string) {
    if (result.ok) {
      setStatus({ tone: "saved", text: success });
      celebrate(result);
      return true;
    }
    setStatus({
      tone: "error",
      text: result.error,
      needsProfile: result.needsProfile,
    });
    return false;
  }

  function pick(value: number) {
    if (value === score) return;
    const previous = score;
    setScore(value);
    setStatus(null);
    startTransition(async () => {
      const result = await rate(kind, mbid, value);
      if (!settle(result, "Saved")) {
        setScore(previous);
        return;
      }
      const crowd = result.ok ? result.crowd : undefined;
      setHotTake(
        crowd && crowd.count >= HOT_TAKE_CROWD && Math.abs(value - crowd.average) >= HOT_TAKE_GAP
          ? { yours: value, crowd: crowd.average, count: crowd.count }
          : null,
      );
    });
  }

  function commitReview() {
    const text = draft.trim();
    startTransition(async () => {
      if (settle(await saveReview(kind, mbid, text), "Review saved")) {
        setSavedReview(text);
      }
    });
  }

  function remove() {
    const previous = { score, draft, savedReview };
    setScore(null);
    setDraft("");
    setSavedReview("");
    startTransition(async () => {
      if (!settle(await removeRating(kind, mbid), "Rating removed")) {
        setScore(previous.score);
        setDraft(previous.draft);
        setSavedReview(previous.savedReview);
      }
    });
  }

  const reviewChanged = draft.trim() !== savedReview.trim();

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="display-sm text-base text-text">
          {score === null ? `Rate this ${noun}` : "Your rating"}
        </h2>
        <div className="flex items-center gap-4 text-sm">
          <span aria-live="polite" className="text-text-muted">
            {pending ? (
              "Saving…"
            ) : status?.tone === "saved" ? (
              <span className="text-success">✓ {status.text}</span>
            ) : null}
          </span>
          {score !== null && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div
        role="group"
        aria-label="Your score out of 10"
        className="grid grid-cols-5 gap-2 sm:flex sm:flex-wrap sm:gap-1.5"
      >
        {/* Two even rows of five on a phone; one row of ten when there's room. */}
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => pick(n)}
            aria-pressed={score === n}
            className={`h-12 w-full rounded-lg border text-base font-semibold tabular-nums transition-all active:scale-95 sm:h-11 sm:w-11 sm:text-sm ${
              score === n
                ? "border-score-you bg-score-you text-[#0b0b0e]"
                : "border-border bg-surface-raised text-text-secondary hover:border-border-strong hover:text-text"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {status?.tone === "error" && (
        <p className="mt-3 text-sm text-score-you">
          {status.text}
          {status.needsProfile && (
            <>
              {" "}
              <Link
                href="/profile"
                className="font-medium underline underline-offset-4"
              >
                Pick one now
              </Link>
            </>
          )}
        </p>
      )}

      {score === null ? (
        <p className="mt-3 text-xs text-text-muted">Tap a score to save it.</p>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          {hotTake && !savedReview && (
            <div className="hot-take relative mb-2 overflow-hidden rounded-xl border border-accent/40 bg-accent/[0.08] p-4">
              <span
                aria-hidden="true"
                className="hot-take-glow absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/25 blur-2xl"
              />
              <p className="relative text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
                Hot take
              </p>
              <p className="relative mt-1.5 text-sm text-text">
                You gave it a{" "}
                <span className="font-semibold text-score-you">{hotTake.yours}</span>.{" "}
                Everyone else here says{" "}
                <span className="font-semibold text-score-overall">
                  {hotTake.crowd.toFixed(1)}
                </span>
                .{" "}
                {hotTake.yours < hotTake.crowd
                  ? "What are they hearing that you're not?"
                  : "What are they missing?"}
              </p>
              <button
                type="button"
                onClick={() => reviewBox.current?.focus()}
                className="relative mt-3 text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                Say why &rarr;
              </button>
            </div>
          )}
          <label
            htmlFor={`review-${mbid}`}
            className="text-xs font-medium uppercase tracking-wider text-text-secondary"
          >
            Review <span className="normal-case text-text-muted">optional</span>
          </label>
          <textarea
            ref={reviewBox}
            id={`review-${mbid}`}
            rows={3}
            maxLength={1000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={prompt}
            className={`${fieldClass} resize-y`}
          />
          {reviewChanged && (
            <div>
              <button
                type="button"
                onClick={commitReview}
                disabled={pending}
                className={buttonClass({ size: "sm" })}
              >
                Save review
              </button>
            </div>
          )}
        </div>
      )}

      {overlay}
    </div>
  );
}
