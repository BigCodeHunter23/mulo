"use client";

import type { Ref } from "react";
import { COUNT_FROM, REPLY_LIMIT } from "@/lib/replies-shared";
import { buttonClass, fieldClass } from "@/components/ui";

/** Below this many characters left, the count turns red, as for takes. */
const NEARLY_OUT = 20;

/** Where a reply is written: counts down from 900 characters, and Post reply. */
export default function ReplyBox({
  ref,
  value,
  onChange,
  onPost,
  pending,
  error,
}: {
  ref?: Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  onPost: () => void;
  pending: boolean;
  error: string | null;
}) {
  const left = REPLY_LIMIT - value.length;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onPost();
      }}
      className="flex flex-col gap-2"
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={REPLY_LIMIT}
        rows={3}
        placeholder="Add a reply"
        aria-label="Your reply"
        className={`${fieldClass} resize-y`}
      />
      <div className="flex items-center justify-between gap-3">
        <span
          aria-live="polite"
          className={`text-xs tabular-nums ${left < NEARLY_OUT ? "text-score-you" : "text-text-muted"}`}
        >
          {value.length >= COUNT_FROM ? `${left} characters left` : ""}
        </span>
        <button
          type="submit"
          disabled={pending || value.trim().length === 0}
          className={buttonClass({ size: "sm" })}
        >
          {pending ? "Posting…" : "Post reply"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-score-you">
          {error}
        </p>
      )}
    </form>
  );
}
