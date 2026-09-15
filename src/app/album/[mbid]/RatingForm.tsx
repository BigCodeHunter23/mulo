"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  rateAlbum,
  removeRating,
  saveReview,
  type RatingResult,
} from "./actions";
import { buttonClass, fieldClass } from "@/components/ui";

type Status =
  | { tone: "saved"; text: string }
  | { tone: "error"; text: string; needsProfile?: boolean }
  | null;

/**
 * Tapping a score saves it straight away, with no Save button and no reload.
 * The score shows as chosen immediately and rolls back if the save fails.
 * A review is typed, so it gets an explicit save that only appears once
 * there's something new to save.
 */
export default function RatingForm({
  releaseMbid,
  signedIn,
  existing,
}: {
  releaseMbid: string;
  signedIn: boolean;
  existing: { score: number; review: string | null } | null;
}) {
  const [score, setScore] = useState<number | null>(existing?.score ?? null);
  const [savedReview, setSavedReview] = useState(existing?.review ?? "");
  const [draft, setDraft] = useState(existing?.review ?? "");
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  // A success message fades after a moment; errors stay until acted on.
  useEffect(() => {
    if (status?.tone !== "saved") return;
    const timer = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(timer);
  }, [status]);

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
          to rate and review this album.
        </p>
      </div>
    );
  }

  function settle(result: RatingResult, success: string) {
    if (result.ok) {
      setStatus({ tone: "saved", text: success });
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
      if (!settle(await rateAlbum(releaseMbid, value), "Saved")) {
        setScore(previous);
      }
    });
  }

  function commitReview() {
    const text = draft.trim();
    startTransition(async () => {
      if (settle(await saveReview(releaseMbid, text), "Review saved")) {
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
      if (!settle(await removeRating(releaseMbid), "Rating removed")) {
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
          {score === null ? "Rate this album" : "Your rating"}
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
        className="flex flex-wrap gap-1.5"
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => pick(n)}
            aria-pressed={score === n}
            className={`h-11 w-11 rounded-lg border text-sm font-semibold tabular-nums transition-all active:scale-95 ${
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
          <label
            htmlFor={`review-${releaseMbid}`}
            className="text-xs font-medium uppercase tracking-wider text-text-secondary"
          >
            Review <span className="normal-case text-text-muted">optional</span>
          </label>
          <textarea
            id={`review-${releaseMbid}`}
            rows={3}
            maxLength={1000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What did you make of it?"
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
    </div>
  );
}
