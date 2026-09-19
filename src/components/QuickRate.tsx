"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { rate } from "@/app/ratings/actions";
import { useBadgeUnlock } from "@/components/BadgeUnlock";
import Portal from "@/components/Portal";
import { coverSrc } from "@/lib/cover-url";
import { haptic } from "@/lib/haptics";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * The sheet a long press on an album cover opens: ten scores, one tap, done,
 * without leaving the grid. It closes itself a beat after saving so the score
 * can be seen landing.
 */
export default function QuickRate({
  mbid,
  title,
  artist,
  coverUrl,
  current,
  onClose,
  onRated,
}: {
  mbid: string;
  title: string;
  artist?: string | null;
  coverUrl: string | null;
  current?: number;
  onClose: () => void;
  onRated: (score: number) => void;
}) {
  const [picked, setPicked] = useState<number | undefined>(current);
  const [status, setStatus] = useState<"idle" | "saved" | "login" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { celebrate, overlay } = useBadgeUnlock();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close a beat after saving, so the score is seen landing; if a badge came
  // with it, wait until its celebration has been dismissed.
  useEffect(() => {
    if (status !== "saved" || overlay) return;
    const timer = setTimeout(onClose, 650);
    return () => clearTimeout(timer);
  }, [status, overlay, onClose]);

  function pick(score: number) {
    haptic("select");
    const previous = picked;
    setPicked(score);
    setStatus("idle");
    startTransition(async () => {
      const result = await rate("album", mbid, score);
      if (!result.ok) {
        setPicked(previous);
        if (result.needsLogin) setStatus("login");
        else {
          setStatus("error");
          setError(result.error);
        }
        return;
      }
      onRated(score);
      setStatus("saved");
      celebrate(result);
    });
  }

  const src = coverSrc(coverUrl, 250);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[90] flex items-end justify-center bg-bg/70 backdrop-blur-sm sm:items-center"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Rate ${title}`}
      >
        <div
          className="sheet-up w-full max-w-md rounded-t-2xl border border-border-strong bg-surface-raised p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong sm:hidden" />
          <div className="flex items-center gap-3">
            <span className="artwork block h-14 w-14 shrink-0 overflow-hidden rounded-lg">
              {src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="h-full w-full object-cover" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="display-sm truncate text-base text-text">{title}</p>
              {artist && <p className="truncate text-sm text-text-muted">{artist}</p>}
            </div>
            <span aria-live="polite" className="text-sm">
              {status === "saved" && <span className="text-success">✓ Saved</span>}
            </span>
          </div>

          {status === "login" ? (
            <p className="mt-5 text-center text-sm text-text-secondary">
              <Link href="/login" className="font-medium text-accent hover:underline">
                Log in
              </Link>{" "}
              to rate albums.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-5 gap-2">
              {SCORES.map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => pick(score)}
                  aria-pressed={picked === score}
                  className={`flex h-12 items-center justify-center rounded-lg border text-base font-semibold tabular-nums transition-[color,background-color,border-color,transform] active:scale-90 ${
                    picked === score
                      ? "border-score-you bg-score-you text-[#0b0b0e]"
                      : "border-border bg-surface text-text hover:border-score-you/60 hover:text-score-you"
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
          )}
          {status === "error" && error && <p className="mt-3 text-center text-sm text-score-you">{error}</p>}
          <Link
            href={`/album/${mbid}`}
            onClick={onClose}
            className="mt-4 block text-center text-xs text-text-muted underline-offset-4 hover:text-text hover:underline"
          >
            Open the album page
          </Link>
        </div>
      </div>
      {overlay}
    </Portal>
  );
}
