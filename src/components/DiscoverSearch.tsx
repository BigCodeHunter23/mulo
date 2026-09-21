"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchResults } from "@/lib/search";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";

/**
 * The way into search, at the top of Discover.
 *
 * Looking something up and browsing around are the same errand — you open the
 * app wanting a record — so they belong on the same screen rather than behind
 * a tab of their own. This one answers as you type, the way the search page
 * does: a box that takes an Enter and a page load before it shows anything is
 * a worse search than the tab it replaced, which is how it felt.
 *
 * Anything bigger — songs, the wider music database, recent searches — still
 * lives at /search, one row away at the bottom of the results.
 */

const EMPTY: SearchResults = { artists: [], albums: [], songs: [] };

/** How many of each kind fit before the panel would rather be a page. */
const SHOW = { artists: 3, albums: 4, songs: 3 };

type Row = {
  key: string;
  href: string;
  title: string;
  sub: string;
  image: string | null;
  round: boolean;
};

export default function DiscoverSearch() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  /** The search MULO is being asked right now, so "Searching…" can't stick. */
  const [asked, setAsked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const q = term.trim();
  const asking = q.length >= 2;

  useEffect(() => {
    if (!asking) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAsked(q);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (response.ok) setResults(await response.json());
      } catch {
        // Superseded by newer typing; nothing to do.
      } finally {
        // Only the newest search clears it, so an abandoned one can't.
        setAsked((current) => (current === q ? null : current));
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, asking]);

  // Artists first: somebody who types a name usually wants the shelf rather
  // than one record off it.
  const rows = useMemo<Row[]>(() => {
    // Below two letters there is nothing to show, whatever the last search
    // left behind.
    if (!asking) return [];
    return [
      ...results.artists.slice(0, SHOW.artists).map((artist) => ({
        key: `artist-${artist.mbid}`,
        href: `/artist/${artist.mbid}`,
        title: artist.name,
        sub: "Artist",
        image: artistPhotoSrc(artist.image_url, 100),
        round: true,
      })),
      ...results.albums.slice(0, SHOW.albums).map((album) => ({
        key: `album-${album.mbid}`,
        href: `/album/${album.mbid}`,
        title: album.title,
        sub: [album.artist, album.year].filter(Boolean).join(" · ") || "Album",
        image: coverSrc(album.cover_art_url, 250),
        round: false,
      })),
      ...results.songs.slice(0, SHOW.songs).map((song) => ({
        key: `song-${song.mbid}`,
        href: `/album/${song.albumMbid}`,
        title: song.title,
        sub: [song.artist, song.album].filter(Boolean).join(" · ") || "Song",
        image: coverSrc(song.cover_art_url, 250),
        round: false,
      })),
    ];
  }, [results, asking]);

  // A tap anywhere else puts the panel away.
  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  function go(href: string) {
    setOpen(false);
    input.current?.blur();
    router.push(href);
  }

  function everything() {
    if (q) go(`/search?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      input.current?.blur();
      return;
    }
    // Enter is handled here rather than left to the form: a box with no
    // submit button of its own can't be relied on to submit itself.
    if (event.key === "Enter") {
      event.preventDefault();
      if (open && at >= 0 && rows[at]) go(rows[at].href);
      else everything();
      return;
    }
    if (!open || rows.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAt((current) => (current + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setAt((current) => (current <= 0 ? rows.length - 1 : current - 1));
    }
  }

  const loading = asked !== null;
  const nothing = asking && !loading && rows.length === 0;
  const showPanel = open && asking;

  return (
    // Within reach the whole way down Discover on a phone, where the tab bar
    // has no room for a search button of its own.
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 bg-bg/90 px-4 py-2 backdrop-blur-xl sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <div ref={wrap} className="relative">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (at >= 0 && rows[at]) go(rows[at].href);
            else everything();
          }}
        >
          <label htmlFor="discover-search" className="sr-only">
            Search artists, albums and songs
          </label>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-accent"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={input}
            id="discover-search"
            type="search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setOpen(true);
              // Another letter starts the highlight over, so Enter never
              // opens something left from the last word.
              setAt(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showPanel}
            aria-controls="discover-search-results"
            aria-autocomplete="list"
            aria-activedescendant={
              at >= 0 && rows[at] ? `discover-row-${rows[at].key}` : undefined
            }
            placeholder="Search any artist, album or song"
            // The room on the right is only needed once there's something to
            // clear; before that the placeholder gets it.
            className={`h-12 w-full rounded-xl border border-border-strong bg-surface pl-12 text-base text-text transition-colors placeholder:text-text-muted focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden ${
              term ? "pr-24" : "pr-4"
            }`}
          />
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {loading && <span className="text-xs text-text-muted">Searching…</span>}
            {term && (
              <button
                type="button"
                onClick={() => {
                  setTerm("");
                  input.current?.focus();
                }}
                aria-label="Clear search"
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
              >
                ×
              </button>
            )}
          </span>
        </form>

        {showPanel && (
          <div
            id="discover-search-results"
            role="listbox"
            aria-label="Search results"
            className="step-in absolute inset-x-0 top-[calc(100%+0.5rem)] z-40 max-h-[70vh] overflow-y-auto overscroll-contain rounded-2xl border border-border-strong bg-surface-raised/95 py-1.5 shadow-2xl backdrop-blur-xl"
          >
            {rows.map((row, i) => (
              <Link
                key={row.key}
                id={`discover-row-${row.key}`}
                role="option"
                aria-selected={i === at}
                href={row.href}
                onClick={() => setOpen(false)}
                onPointerMove={() => setAt(i)}
                className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                  i === at ? "bg-surface-hover" : "hover:bg-surface-hover"
                }`}
              >
                <span
                  className={`artwork h-10 w-10 shrink-0 overflow-hidden bg-surface ${
                    row.round ? "rounded-full" : "rounded-md"
                  }`}
                >
                  {row.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.image}
                      alt=""
                      loading="lazy"
                      className={`h-full w-full object-cover ${row.round ? "object-top" : ""}`}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">{row.title}</span>
                  <span className="block truncate text-xs text-text-muted">{row.sub}</span>
                </span>
              </Link>
            ))}

            {nothing && (
              <p className="px-3 py-2.5 text-sm text-text-secondary">
                Nothing in MULO for &ldquo;{q}&rdquo; yet.
              </p>
            )}

            {/* Songs, recent searches and everything MULO hasn't got yet all
                live on the search page. */}
            <button
              type="button"
              onClick={everything}
              className="mt-1 flex w-full items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
            >
              <span className="truncate">
                {nothing ? "Look in the wider music database" : "See everything"} for &ldquo;{q}
                &rdquo;
              </span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
