"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TAKE_LIMIT } from "@/lib/versus-shared";
import { buttonClass, fieldClass } from "@/components/ui";
import { deleteTake, postTake } from "./actions";

/** Where you make your case for the side you picked. */
export function TakeComposer({
  matchupId,
  pickedName,
}: {
  matchupId: number;
  pickedName: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const left = TAKE_LIMIT - body.length;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await postTake(matchupId, body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border bg-surface p-3 transition-colors focus-within:border-border-strong"
    >
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={TAKE_LIMIT}
        rows={3}
        placeholder={`Why ${pickedName}? Make your case.`}
        aria-label="Your take"
        className={`${fieldClass} resize-none border-0 bg-transparent p-1 text-base focus:border-0 sm:text-sm`}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span
          className={`text-xs tabular-nums ${left < 20 ? "text-score-you" : "text-text-muted"}`}
        >
          {left}
        </span>
        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className={buttonClass({ size: "sm" })}
        >
          {pending ? "Posting…" : "Post take"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-[#ffb4ae]">
          {error}
        </p>
      )}
    </form>
  );
}

/** Takes your own take down. */
export function DeleteTake({ takeId }: { takeId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm("Delete your take?")) return;
    startTransition(async () => {
      const result = await deleteTake(takeId);
      if (result.ok) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
