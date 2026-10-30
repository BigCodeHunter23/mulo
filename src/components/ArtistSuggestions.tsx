"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { followArtists } from "@/app/artist/[mbid]/actions";
import CoverImage from "@/components/CoverImage";
import { buttonClass } from "@/components/ui";
import type { ArtistSummary } from "@/lib/app-api";
import { artistPhotoSrc } from "@/lib/cover-url";
import { haptic } from "@/lib/haptics";

/** Kept in the browser once the card is used or closed, as dismissed tips are. */
const KEY = "mulo:artist-suggestions-done";
const listeners = new Set<() => void>();

function done(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function remember() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // No storage: the card just shows again next time.
  }
  listeners.forEach((listener) => listener());
}

/**
 * "Follow the artists you rate highest": every one ticked to start, Follow
 * these follows the ticked ones at once. On your own profile it shows until
 * it's used or closed; `always` shows it on an artist's page after a first
 * follow, whatever was stored.
 */
export default function ArtistSuggestions({
  artists,
  always = false,
}: {
  artists: ArtistSummary[];
  always?: boolean;
}) {
  // Hidden on the server and until storage says it hasn't been used.
  const hidden = useSyncExternalStore(subscribe, done, () => true);
  const [ticked, setTicked] = useState(() => new Set(artists.map((artist) => artist.mbid)));
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (closed || artists.length === 0 || (hidden && !always)) return null;

  function close() {
    remember();
    setClosed(true);
  }

  function toggle(mbid: string) {
    haptic("select");
    setTicked((before) => {
      const after = new Set(before);
      if (after.has(mbid)) after.delete(mbid);
      else after.add(mbid);
      return after;
    });
  }

  function follow() {
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await followArtists([...ticked]);
      if (result.ok) close();
      else setError(result.error);
    });
  }

  return (
    <section
      aria-labelledby="artist-suggestions"
      className="step-in w-full rounded-xl border border-border bg-surface p-4 text-left sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="artist-suggestions" className="display-sm text-lg text-text">
          Follow the artists you rate highest
        </h2>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="-mr-1 -mt-1 rounded-md px-2 py-1 text-lg leading-none text-text-muted hover:bg-surface-raised hover:text-text"
        >
          ×
        </button>
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {artists.map((artist) => (
          <li key={artist.mbid}>
            <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
              <input
                type="checkbox"
                checked={ticked.has(artist.mbid)}
                onChange={() => toggle(artist.mbid)}
                className="peer sr-only"
              />
              <span className="artwork aspect-square w-full overflow-hidden rounded-full opacity-40 ring-2 ring-transparent transition peer-checked:opacity-100 peer-checked:ring-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                <CoverImage
                  src={artistPhotoSrc(artist.image_url, 300)}
                  alt=""
                  className="h-full w-full object-cover object-top"
                  fallback={
                    <span className="flex h-full w-full items-center justify-center text-xl font-bold text-text-muted">
                      {artist.name.charAt(0).toUpperCase()}
                    </span>
                  }
                />
              </span>
              <span className="line-clamp-2 text-xs font-medium text-text">{artist.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-xs text-score-you">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={follow}
        disabled={pending || ticked.size === 0}
        className={`${buttonClass()} mt-4`}
      >
        Follow these
      </button>
    </section>
  );
}
