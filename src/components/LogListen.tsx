"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { logDiaryListen } from "@/app/diary/actions";
import LoginLink from "@/components/LoginLink";
import { buttonClass, fieldClass } from "@/components/ui";
import { localDay } from "@/lib/diary-shared";
import { haptic } from "@/lib/haptics";

type View = "closed" | "open" | "logged";

/** Today and yesterday in this browser's own time zone, worked out when the panel opens. */
function days() {
  const today = localDay(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { today, yesterday };
}

const choice = (on: boolean) =>
  `h-9 rounded-lg border px-3 text-sm font-medium transition-colors sm:h-8 ${
    on
      ? "border-accent bg-accent/15 text-text"
      : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text"
  }`;

/**
 * Puts the album in your diary on a day: today, yesterday or any day back to
 * 1900, with a score if you like. Your own score is picked already, and it's
 * only sent when you change it.
 */
export default function LogListen({
  mbid,
  signedIn,
  score,
}: {
  mbid: string;
  signedIn: boolean;
  /** Your score for this album, if you've rated it. */
  score: number | null;
}) {
  const [view, setView] = useState<View>("closed");
  const [when, setWhen] = useState(() => ({ today: "", yesterday: "" }));
  const [day, setDay] = useState("");
  const [picked, setPicked] = useState<number | null>(score);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  // Tapping anywhere else, or Escape, closes it.
  useEffect(() => {
    if (view === "closed") return;
    function onPointer(event: PointerEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setView("closed");
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setView("closed");
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [view]);

  if (!signedIn) {
    return (
      <LoginLink className={buttonClass({ variant: "secondary", size: "sm" })}>
        Log a listen
      </LoginLink>
    );
  }

  function open() {
    if (view === "open") {
      setView("closed");
      return;
    }
    const fresh = days();
    setWhen(fresh);
    setDay(fresh.today);
    setPicked(score);
    setError(null);
    setView("open");
  }

  function pick(n: number) {
    haptic("select");
    // Tapping the picked score again goes back to the one you already have.
    setPicked((current) => (current === n ? score : n));
  }

  function log() {
    haptic("tap");
    setError(null);
    const changed = picked !== null && picked !== score ? picked : undefined;
    startTransition(async () => {
      const result = await logDiaryListen(mbid, day, changed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setView("logged");
    });
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={open}
        aria-expanded={view === "open"}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        Log a listen
      </button>

      {view === "logged" && (
        <p
          role="status"
          className="absolute left-1/2 top-full z-30 mt-2 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-border-strong bg-surface-raised px-4 py-3 text-left text-sm text-text shadow-2xl sm:left-0 sm:translate-x-0"
        >
          Logged in your diary.{" "}
          <Link
            href="/diary"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            See your diary
          </Link>
        </p>
      )}

      {view === "open" && (
        <div className="absolute left-1/2 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-border-strong bg-surface-raised p-4 text-left shadow-2xl sm:left-0 sm:translate-x-0">
          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-wider text-text-secondary">
              When
            </legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDay(when.today)}
                aria-pressed={day === when.today}
                className={choice(day === when.today)}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDay(when.yesterday)}
                aria-pressed={day === when.yesterday}
                className={choice(day === when.yesterday)}
              >
                Yesterday
              </button>
              <div className="min-w-36 flex-1">
                <input
                  type="date"
                  aria-label="Another day"
                  min="1900-01-01"
                  max={when.today}
                  value={day}
                  onChange={(event) => {
                    if (event.target.value) setDay(event.target.value);
                  }}
                  className={fieldClass}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-xs font-medium uppercase tracking-wider text-text-secondary">
              Score <span className="normal-case text-text-muted">optional</span>
            </legend>
            <div
              role="group"
              aria-label="Your score out of 10"
              className="mt-2 grid grid-cols-5 gap-1.5"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pick(n)}
                  aria-pressed={picked === n}
                  className={`h-9 rounded-lg border text-sm font-semibold tabular-nums transition-all active:scale-95 ${
                    picked === n
                      ? "border-score-you bg-score-you text-ink"
                      : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="mt-3 text-xs text-error-soft">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={log}
            disabled={pending || !day}
            className={`${buttonClass({ size: "sm" })} mt-4 w-full`}
          >
            {pending ? "Logging…" : "Log it"}
          </button>
        </div>
      )}
    </div>
  );
}
