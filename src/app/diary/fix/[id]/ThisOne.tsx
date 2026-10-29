"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fixDiaryAlbum } from "@/app/diary/actions";
import { buttonClass } from "@/components/ui";

/** Picks this album for the entry's names, then back to the diary. */
export default function ThisOne({
  entryId,
  mbid,
  title,
}: {
  entryId: number;
  mbid: string;
  /** The album, for screen readers. */
  title: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pick() {
    setError(null);
    startTransition(async () => {
      const result = await fixDiaryAlbum(entryId, mbid);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/diary");
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={pick}
        disabled={pending}
        aria-label={`This one: ${title}`}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        {pending ? "Saving…" : "This one"}
      </button>
      {error && (
        <p role="alert" className="max-w-48 text-right text-xs text-error-soft">
          {error}
        </p>
      )}
    </div>
  );
}
