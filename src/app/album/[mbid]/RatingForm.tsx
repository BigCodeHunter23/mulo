"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitRating, type RatingState } from "./actions";

function SaveButton({ existing }: { existing: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="intent"
      value="save"
      disabled={pending}
      className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
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
      className="text-sm text-gray-500 underline disabled:opacity-60"
    >
      Remove my rating
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

  // A removed rating should leave no score selected behind. Adjusting state
  // during render is React's recommended way to react to a changed value,
  // rather than syncing it in an effect.
  const [clearedSeen, setClearedSeen] = useState(false);
  if (Boolean(state.cleared) !== clearedSeen) {
    setClearedSeen(Boolean(state.cleared));
    if (state.cleared) setScore(null);
  }

  if (!signedIn) {
    return (
      <div className="rounded border border-gray-200 p-4">
        <p className="text-sm text-gray-600">
          <Link href="/login" className="font-medium underline">
            Log in
          </Link>{" "}
          to rate and review this album.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-gray-200 p-4">
      <h2 className="mb-3 font-bold">
        {existing ? "Your rating" : "Rate this album"}
      </h2>

      {state.message && (
        <p className="mb-3 rounded bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4">
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
                className={`h-10 w-10 rounded border text-sm font-medium ${
                  score === n
                    ? "border-red-500 bg-red-500 text-white"
                    : "border-gray-300 text-gray-700 hover:border-gray-400"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            {score ? `You rated this ${score}/10.` : "Pick a score out of 10."}
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Review <span className="text-xs text-gray-500">(optional)</span>
          <textarea
            name="review"
            rows={3}
            maxLength={1000}
            defaultValue={existing?.review ?? ""}
            placeholder="What did you make of it?"
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <div className="flex items-center gap-4">
          <SaveButton existing={Boolean(existing)} />
          {existing && <RemoveButton />}
        </div>
      </form>
    </div>
  );
}
