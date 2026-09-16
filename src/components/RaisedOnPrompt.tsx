"use client";

import Link from "next/link";
import { useState } from "react";
import { RAISED_ON_PROMPT_COOKIE } from "@/lib/record-avatar";
import { buttonClass } from "@/components/ui";

function Vinyl() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="record-spin h-24 w-24 text-accent">
      <circle cx="50" cy="50" r="48" fill="#0b0b0e" />
      {[40, 33, 26].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#35353f" strokeWidth="1" />
      ))}
      <circle cx="50" cy="50" r="15" fill="currentColor" />
      <path d="M50 38a12 12 0 0 1 12 12" fill="none" stroke="#0b0b0e" strokeWidth="2" opacity="0.35" />
      <circle cx="50" cy="50" r="2.5" fill="#0b0b0e" />
    </svg>
  );
}

/**
 * A one-time nudge for accounts made before Raised On existed. Hiding it is
 * remembered in this browser; picking a record makes it go away everywhere.
 */
export default function RaisedOnPrompt({ hasPhoto }: { hasPhoto: boolean }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  function hide() {
    document.cookie = `${RAISED_ON_PROMPT_COOKIE}=hidden; max-age=31536000; path=/; samesite=lax`;
    setHidden(true);
  }

  return (
    <section className="relative mb-10 flex items-center gap-5 overflow-hidden rounded-2xl border border-border bg-surface p-5">
      <button
        type="button"
        onClick={hide}
        aria-label="Hide this"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
      >
        ×
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          New: Raised On
        </p>
        <h2 className="display mt-1.5 text-xl text-text">What were you raised on?</h2>
        <p className="mt-1.5 max-w-md text-sm text-text-secondary">
          Pick the record you grew up on, from any decade. It shows on your profile
          {hasPhoto ? "." : ", and it's your picture until you add a photo."}
        </p>
        <Link href="/profile/raised-on" className={`${buttonClass({ size: "sm" })} mt-4`}>
          Pick yours
        </Link>
      </div>
      <div className="hidden shrink-0 sm:block">
        <Vinyl />
      </div>
    </section>
  );
}
