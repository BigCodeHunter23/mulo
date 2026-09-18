"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createList, updateList } from "@/app/lists/actions";
import { buttonClass, fieldClass } from "@/components/ui";

/** The name, a line about it, and whether the order counts: for new lists and edits. */
export default function ListForm({
  list,
  releaseMbid,
  onDone,
}: {
  /** Set when editing an existing list. */
  list?: { id: number; title: string; description: string | null; ranked: boolean };
  /** An album to start a new list with. */
  releaseMbid?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(list?.title ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [ranked, setRanked] = useState(list?.ranked ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = list
        ? await updateList(list.id, { title, description, ranked })
        : await createList({ title, description, ranked, releaseMbid });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (list) {
        onDone?.();
        router.refresh();
      } else {
        router.push(`/lists/${result.id}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Name</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          required
          autoFocus={!list}
          placeholder="Perfect debut albums"
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">
          About it <span className="font-normal text-text-muted">(optional)</span>
        </span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="What ties these together?"
          className={fieldClass}
        />
      </label>
      <label className="flex items-center gap-3 text-sm text-text">
        <input
          type="checkbox"
          checked={ranked}
          onChange={(event) => setRanked(event.target.checked)}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
        Ranked: number the albums, so the order counts
      </label>
      {error && <p className="text-sm text-score-you">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={buttonClass()}>
          {pending ? "Saving…" : list ? "Save" : "Create list"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className={buttonClass({ variant: "ghost" })}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
