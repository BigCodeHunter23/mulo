"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitRating, type RatingState } from "./actions";
import { buttonClass, fieldClass, Notice } from "@/components/ui";

function SaveButton({ existing }: { existing: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="intent"
      value="save"
      disabled={pending}
      className={buttonClass()}
    >
      {pending ? "Saving…" : existing ? "Update rating" : "Save rating"}
    </button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="intent"
      value="remove"
      disabled={pending}
      className="text-sm text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline disabled:opacity-50"
    >
      Remove
    </button>
  );
}

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
  const [state, formAction] = useActionState<RatingState, FormData>(
    submitRating,
    {},
  );

  // Clearing after a removal, adjusted during render rather than in an effect.
  const [clearedSeen, setClearedSeen] = useState(false);
  if (Boolean(state.cleared) !== clearedSeen) {
    setClearedSeen(Boolean(state.cleared));
    if (state.cleared) setScore(null);
  }

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

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="display-sm text-base text-text">
          {existing ? "Your rating" : "Rate this album"}
        </h2>
        {existing && (
          <form action={formAction}>
            <input type="hidden" name="release_mbid" value={releaseMbid} />
            <RemoveButton />
          </form>
        )}
      </div>

      {state.message && (
        <div className="mb-4">
          <Notice tone="info">{state.message}</Notice>
        </div>
      )}
      {state.error && (
        <div className="mb-4">
          <Notice tone="error">{state.error}</Notice>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="release_mbid" value={releaseMbid} />
        <input type="hidden" name="score" value={score ?? ""} />

        <div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                aria-pressed={score === n}
                className={`h-11 w-11 rounded-lg border text-sm font-semibold tabular-nums transition-all ${
                  score === n
                    ? "border-score-you bg-score-you text-[#0b0b0e]"
                    : "border-border bg-surface-raised text-text-secondary hover:border-border-strong hover:text-text"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {score ? `You rated this ${score} out of 10.` : "Pick a score."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
            Review <span className="normal-case text-text-muted">optional</span>
          </span>
          <textarea
            name="review"
            rows={3}
            maxLength={1000}
            defaultValue={existing?.review ?? ""}
            placeholder="What did you make of it?"
            className={`${fieldClass} resize-y`}
          />
        </div>

        <div>
          <SaveButton existing={Boolean(existing)} />
        </div>
      </form>
    </div>
  );
}
