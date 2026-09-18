"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SearchAlbum, SearchArtist, SearchResults } from "@/lib/search";
import { coverSrc } from "@/lib/cover-url";
import AlbumCard from "@/components/AlbumCard";
import ArtistCard from "@/components/ArtistCard";
import { fieldClass, SectionHeading } from "@/components/ui";
import WiderResults, { type WiderAlbum, type WiderArtist } from "./WiderResults";

const EMPTY: SearchResults = { artists: [], albums: [], songs: [] };

type Wider = { artists: WiderArtist[]; albums: WiderAlbum[]; failed: boolean };

/**
 * How long typing has to pause before the wider music database is asked.
 * Longer than the catalogue search, because every one of these is a request
 * to MusicBrainz, which allows about one a second across the whole site.
 */
const WIDER_PAUSE_MS = 650;

// Recent searches live in this browser only.
const RECENT_KEY = "mulo:recent-searches";
const listeners = new Set<() => void>();

function readRecent() {
  try {
    return localStorage.getItem(RECENT_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribeRecent(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function parseRecent(raw: string): string[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Private browsing or storage turned off: recents just don't stick.
  }
  listeners.forEach((listener) => listener());
}

function remember(query: string) {
  const q = query.trim();
  if (q.length < 2) return;
  const others = parseRecent(readRecent()).filter(
    (item) => item.toLowerCase() !== q.toLowerCase(),
  );
  saveRecent([q, ...others].slice(0, 6));
}

const RAIL =
  "rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:gap-x-4 sm:gap-y-6 sm:overflow-visible sm:px-0 sm:pb-0";

/**
 * Searches MULO's catalogue as you type. Pressing Enter also runs the slower
 * search across all of MusicBrainz, whose results the page streams in below
 * as `children`, for anything MULO doesn't have yet.
 */
export default function SearchClient({
  initialQuery,
  initialResults,
  browse,
  children,
}: {
  initialQuery: string;
  initialResults: SearchResults;
  /** Shown before anything is typed. */
  browse: { artists: SearchArtist[]; albums: SearchAlbum[] };
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(initialResults);
  const [loading, setLoading] = useState(false);
  const lastSearched = useRef(initialQuery.trim());
  const input = useRef<HTMLInputElement>(null);
  const recentRaw = useSyncExternalStore(subscribeRecent, readRecent, () => "[]");
  const recent = useMemo(() => parseRecent(recentRaw), [recentRaw]);

  useEffect(() => {
    const q = query.trim();
    if (q === lastSearched.current) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      lastSearched.current = q;
      // Keep the address in step without reloading, so a search can be
      // refreshed or shared.
      window.history.replaceState(
        null,
        "",
        q ? `/search?q=${encodeURIComponent(q)}` : "/search",
      );

      if (q.length < 2) {
        setResults(EMPTY);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (response.ok) setResults(await response.json());
      } catch {
        // Superseded by a newer search; nothing to do.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  /**
   * The wider music database, asked automatically once typing pauses.
   *
   * It used to need Enter, with a small grey line saying so. Anybody who typed
   * "Fisher" and waited saw "Nothing in MULO matches" and reasonably concluded
   * he wasn't on MULO at all — when MusicBrainz had him the whole time. Now
   * both arrive without asking, MULO's own results first.
   */
  const [wider, setWider] = useState<Wider | null>(null);
  const [widerFor, setWiderFor] = useState("");
  const [widerLoading, setWiderLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    // A search that arrived from a link already has these from the server.
    if (q.length < 2 || q === initialQuery.trim()) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setWiderLoading(true);
      try {
        // A busy moment at MusicBrainz is usually over a couple of seconds
        // later, so one quiet second try comes before any "busy" message.
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2500));
          if (controller.signal.aborted) return;

          const response = await fetch(
            `/api/search/wider?q=${encodeURIComponent(q)}${attempt ? "&again=1" : ""}`,
            { signal: controller.signal },
          );
          if (!response.ok) continue;

          const answer = (await response.json()) as Wider;
          const empty = answer.artists.length === 0 && answer.albums.length === 0;
          if (answer.failed && empty && attempt === 0) continue;

          setWider(answer);
          setWiderFor(q);
          break;
        }
      } catch {
        // Superseded by newer typing; nothing to do.
      } finally {
        if (!controller.signal.aborted) setWiderLoading(false);
      }
    }, WIDER_PAUSE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, initialQuery]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    remember(q);
    input.current?.blur();
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const q = query.trim();
  const nothing =
    q.length >= 2 &&
    !loading &&
    results.artists.length === 0 &&
    results.albums.length === 0 &&
    results.songs.length === 0;

  return (
    <div>
      {/* The box stays in reach while you scroll the results. */}
      <form
        onSubmit={submit}
        role="search"
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 mb-8 bg-bg/90 px-4 pb-3 pt-1 backdrop-blur-xl sm:static sm:mx-0 sm:mb-10 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
      >
        <div className="relative">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Artists, albums, songs"
          aria-label="Search artists, albums and songs"
          className={`${fieldClass} h-12 rounded-xl pl-12 pr-24 text-base sm:text-base [&::-webkit-search-cancel-button]:hidden`}
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {loading && <span className="text-xs text-text-muted">Searching…</span>}
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                input.current?.focus();
              }}
              aria-label="Clear search"
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              ×
            </button>
          )}
        </span>
        </div>
      </form>

      {q.length < 2 && (
        <div className="step-in flex flex-col gap-10">
          {recent.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Recent
                </h2>
                <button
                  type="button"
                  onClick={() => saveRecent([])}
                  className="text-xs text-text-muted transition-colors hover:text-text"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuery(item)}
                    className="h-9 rounded-full border border-border bg-surface px-3.5 text-sm text-text-secondary transition-colors hover:border-border-strong hover:text-text active:scale-[0.97]"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>
          )}

          {browse.artists.length > 0 && (
            <section>
              <SectionHeading>Popular artists</SectionHeading>
              <ul className={`${RAIL} sm:grid-cols-4 lg:grid-cols-6`}>
                {browse.artists.map((artist, i) => (
                  <li key={artist.mbid} className="w-[29%] shrink-0 sm:w-auto">
                    <ArtistCard
                      mbid={artist.mbid}
                      name={artist.name}
                      imageUrl={artist.image_url}
                      eager={i < 4}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {browse.albums.length > 0 && (
            <section>
              <SectionHeading>Most-played albums</SectionHeading>
              <ul className={`${RAIL} sm:grid-cols-4 lg:grid-cols-5`}>
                {browse.albums.map((album) => (
                  <li key={album.mbid} className="w-[42%] shrink-0 sm:w-auto">
                    <AlbumCard
                      mbid={album.mbid}
                      title={album.title}
                      artist={album.artist}
                      year={album.year}
                      coverUrl={album.cover_art_url}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {q.length >= 2 && (
        // Opening a result counts as searching for it.
        <div onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("a")) remember(q);
        }}>

      {results.artists.length > 0 && (
        <section className="mb-12">
          <SectionHeading>Artists</SectionHeading>
          <ul className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-8">
            {results.artists.map((artist, i) => (
              <li key={artist.mbid}>
                <ArtistCard
                  mbid={artist.mbid}
                  name={artist.name}
                  imageUrl={artist.image_url}
                  eager={i < 4}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.albums.length > 0 && (
        <section className="mb-12">
          <SectionHeading>Albums</SectionHeading>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-4">
            {results.albums.map((album, i) => (
              <li key={album.mbid}>
                <AlbumCard
                  mbid={album.mbid}
                  title={album.title}
                  artist={album.artist}
                  year={album.year}
                  coverUrl={album.cover_art_url}
                  eager={i < 4}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.songs.length > 0 && (
        <section className="mb-12">
          <SectionHeading>Songs</SectionHeading>
          <ol className="overflow-hidden rounded-xl border border-border">
            {results.songs.map((song, i) => {
              const cover = coverSrc(song.cover_art_url, 250);

              return (
                <li key={song.mbid} className={i % 2 ? "bg-surface/40" : ""}>
                  <Link
                    href={`/album/${song.albumMbid}`}
                    className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-hover"
                  >
                    <span className="artwork h-11 w-11 shrink-0 overflow-hidden rounded-md">
                      {cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt=""
                          loading={i < 4 ? "eager" : "lazy"}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text transition-colors group-hover:text-accent">
                        {song.title}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {song.album}
                        {song.artist && ` · ${song.artist}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-text-muted transition-colors group-hover:text-text">
                      Rate it →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Not a dead end: whatever MULO hasn't got yet is on its way below. */}
      {nothing && (
        <p className="mb-8 text-sm text-text-secondary">
          Nobody&rsquo;s rated &ldquo;{q}&rdquo; on MULO yet &mdash; here&rsquo;s
          everything else we found.
        </p>
      )}
        </div>
      )}

      {q.length >= 2 &&
        (q === initialQuery.trim() ? (
          children
        ) : widerFor === q && wider ? (
          wider.artists.length || wider.albums.length ? (
            <WiderResults artists={wider.artists} albums={wider.albums} />
          ) : (
            <p className="text-sm text-text-muted">
              {wider.failed
                ? "The wider music database is busy right now. Give it a moment and try again."
                : `Nothing found for “${q}”. Check the spelling, or try the artist's name.`}
            </p>
          )
        ) : (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <span className="search-dot h-1.5 w-1.5 rounded-full bg-accent" />
            {widerLoading ? "Searching the wider music database…" : "Keep typing…"}
          </p>
        ))}
    </div>
  );
}
