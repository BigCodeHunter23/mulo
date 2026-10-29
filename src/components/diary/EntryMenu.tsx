"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { deleteDiaryEntry } from "@/app/diary/actions";
import type { DiaryEntry } from "@/lib/app-api";

const item =
  "block w-full rounded-md px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text";

/**
 * The owner's "⋯" on a diary entry: say which album it is (or that it's the
 * wrong one), or delete it. Escape or a click anywhere else puts it away.
 */
export default function EntryMenu({
  id,
  matching,
  title,
}: {
  id: number;
  matching: DiaryEntry["matching"];
  /** What the entry is called, for screen readers. */
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function remove() {
    setOpen(false);
    if (!window.confirm(`Delete ${title} on this day from your diary?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteDiaryEntry(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((was) => !was)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`More for ${title}`}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-50"
      >
        ⋯
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-border-strong bg-surface-raised p-1 shadow-xl"
        >
          <Link role="menuitem" href={`/diary/fix/${id}`} className={item}>
            {matching === "matched" ? "Wrong album?" : "Which album is this?"}
          </Link>
          <button role="menuitem" type="button" onClick={remove} className={item}>
            Delete
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="absolute right-0 top-full mt-1 w-48 text-xs text-error-soft">
          {error}
        </p>
      )}
    </div>
  );
}
