"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { addToList, removeFromList } from "@/app/lists/actions";
import { buttonClass } from "@/components/ui";

type MyList = { id: number; title: string; has: boolean; full: boolean };

/**
 * Puts the album on one of your lists, or takes it off, from its own page.
 * Each tick saves straight away and rolls back if it fails.
 */
export default function AddToList({
  releaseMbid,
  signedIn,
  lists: initial,
}: {
  releaseMbid: string;
  signedIn: boolean;
  lists: MyList[];
}) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  // Tapping anywhere else, or Escape, closes it.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!signedIn) {
    return (
      <Link href="/login" className={buttonClass({ variant: "secondary", size: "sm" })}>
        Add to list
      </Link>
    );
  }

  function toggle(list: MyList) {
    const next = !list.has;
    setError(null);
    setLists((current) => current.map((l) => (l.id === list.id ? { ...l, has: next } : l)));
    startTransition(async () => {
      const result = next ? await addToList(list.id, releaseMbid) : await removeFromList(list.id, releaseMbid);
      if (!result.ok) {
        setError(result.error);
        setLists((current) => current.map((l) => (l.id === list.id ? { ...l, has: !next } : l)));
      }
    });
  }

  const count = lists.filter((l) => l.has).length;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        {count > 0 ? `On ${count} of your lists` : "Add to list"}
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-border-strong bg-surface-raised p-2 text-left shadow-2xl sm:left-0 sm:translate-x-0">
          {lists.length > 0 && (
            <ul className="max-h-64 overflow-y-auto">
              {lists.map((list) => (
                <li key={list.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-text hover:bg-surface-hover">
                    <input
                      type="checkbox"
                      checked={list.has}
                      disabled={list.full && !list.has}
                      onChange={() => toggle(list)}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">{list.title}</span>
                    {list.full && !list.has && <span className="text-xs text-text-muted">Full</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="px-2 py-1 text-xs text-score-you">{error}</p>}
          <Link
            href={`/lists/new?add=${releaseMbid}`}
            className="mt-1 block rounded-lg px-2 py-2 text-sm font-medium text-accent hover:bg-surface-hover"
          >
            + New list with this album
          </Link>
        </div>
      )}
    </div>
  );
}
