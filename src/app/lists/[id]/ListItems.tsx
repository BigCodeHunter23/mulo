"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addToList, deleteList, moveInList, removeFromList, setListNote } from "@/app/lists/actions";
import type { ListItem } from "@/lib/lists";
import { coverSrc } from "@/lib/cover-url";
import { buttonClass, fieldClass } from "@/components/ui";
import ListForm from "../ListForm";
import { haptic } from "@/lib/haptics";

type Found = { mbid: string; title: string; artist: string | null; cover_art_url: string | null; year: string | null };

/**
 * A list's albums. Anyone sees them in order with their notes; the owner also
 * gets the tools: move up and down, a note per album, remove, add by search,
 * edit the details, delete. Every change saves straight away and the page
 * refreshes from the server, so what's shown is always what's stored.
 */
export default function ListItems({
  list,
  items,
  editable,
  limit,
}: {
  list: { id: number; title: string; description: string | null; ranked: boolean };
  items: ListItem[];
  editable: boolean;
  limit: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Couldn't save that. Please try again.");
        return;
      }
      after?.();
      router.refresh();
    });
  }

  return (
    <div>
      {editable && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditingDetails((open) => !open)}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Edit details
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteList(list.id),
                    () => router.push("/lists"),
                  )
                }
                className={buttonClass({ size: "sm" })}
              >
                Yes, delete it
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className={buttonClass({ variant: "ghost", size: "sm" })}
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              Delete list
            </button>
          )}
        </div>
      )}

      {editingDetails && (
        <div className="mb-8 rounded-xl border border-border bg-surface p-4">
          <ListForm list={list} onDone={() => setEditingDetails(false)} />
        </div>
      )}

      {error && <p className="mb-4 text-sm text-score-you">{error}</p>}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-text-secondary">
          {editable ? "No albums yet. Search below to add the first." : "No albums on this list yet."}
        </p>
      ) : (
        <ol className={`flex flex-col gap-2 ${pending ? "opacity-70" : ""}`}>
          {items.map((item, i) => (
            <li key={item.mbid} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-3">
                {list.ranked && (
                  <span className="display w-8 shrink-0 text-center text-xl tabular-nums text-accent">
                    {i + 1}
                  </span>
                )}
                <Link href={`/album/${item.mbid}`} className="shrink-0">
                  <span className="artwork block h-14 w-14 overflow-hidden rounded-md sm:h-16 sm:w-16">
                    {item.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverSrc(item.cover, 250) ?? item.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </span>
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/album/${item.mbid}`} className="block truncate font-medium text-text hover:text-accent">
                    {item.title}
                  </Link>
                  <p className="truncate text-sm text-text-muted">
                    {[item.artist, item.year].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {editable && (
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      label={`Move ${item.title} up`}
                      disabled={pending || i === 0}
                      onClick={() => run(() => moveInList(list.id, item.mbid, i))}
                    >
                      ↑
                    </IconButton>
                    <IconButton
                      label={`Move ${item.title} down`}
                      disabled={pending || i === items.length - 1}
                      onClick={() => run(() => moveInList(list.id, item.mbid, i + 2))}
                    >
                      ↓
                    </IconButton>
                    <IconButton
                      label={`Remove ${item.title}`}
                      disabled={pending}
                      onClick={() => run(() => removeFromList(list.id, item.mbid))}
                    >
                      ×
                    </IconButton>
                  </div>
                )}
              </div>

              {editingNote === item.mbid ? (
                <form
                  className="mt-3 flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(
                      () => setListNote(list.id, item.mbid, note),
                      () => setEditingNote(null),
                    );
                  }}
                >
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={280}
                    rows={2}
                    autoFocus
                    placeholder="Why it's here"
                    className={fieldClass}
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={pending} className={buttonClass({ size: "sm" })}>
                      Save note
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingNote(null)}
                      className={buttonClass({ variant: "ghost", size: "sm" })}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : item.note ? (
                <p className="mt-2 whitespace-pre-line text-sm text-text-secondary sm:pl-[calc(4rem+0.75rem)]">
                  {item.note}
                  {editable && (
                    <button
                      type="button"
                      onClick={() => {
                        setNote(item.note ?? "");
                        setEditingNote(item.mbid);
                      }}
                      className="ml-2 text-xs text-text-muted underline-offset-4 hover:text-text hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </p>
              ) : (
                editable && (
                  <button
                    type="button"
                    onClick={() => {
                      setNote("");
                      setEditingNote(item.mbid);
                    }}
                    className="mt-2 text-xs text-text-muted underline-offset-4 hover:text-text hover:underline"
                  >
                    Add a note
                  </button>
                )
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && items.length < limit && (
        <AddAlbums
          listed={new Set(items.map((item) => item.mbid))}
          onAdd={(mbid) => run(() => addToList(list.id, mbid))}
          pending={pending}
        />
      )}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-base text-text-secondary transition-colors hover:border-border-strong hover:text-text disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Search MULO's catalogue and add albums with one tap. */
function AddAlbums({
  listed,
  onAdd,
  pending,
}: {
  listed: Set<string>;
  onAdd: (mbid: string) => void;
  pending: boolean;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = (await response.json()) as { albums?: Found[] };
        setFound(body.albums ?? []);
      } catch {
        // A cancelled or failed search just leaves the last results up.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const results = query.trim().length < 2 ? [] : found;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium text-text">Add albums</h2>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search for an album"
        aria-label="Search for an album to add"
        className={fieldClass}
      />
      {results.length > 0 && (
        <ul className="mt-2 flex flex-col overflow-hidden rounded-xl border border-border">
          {results.map((album) => {
            const has = listed.has(album.mbid);
            return (
              <li key={album.mbid} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
                <span className="artwork block h-10 w-10 shrink-0 overflow-hidden rounded">
                  {album.cover_art_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverSrc(album.cover_art_url, 250) ?? album.cover_art_url} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">{album.title}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {[album.artist, album.year].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={has || pending}
                  onClick={() => onAdd(album.mbid)}
                  className={buttonClass({ variant: has ? "ghost" : "secondary", size: "sm" })}
                >
                  {has ? "Added" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
