"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SearchResults } from "@/lib/search";
import AlbumCard from "@/components/AlbumCard";
import ArtistCard from "@/components/ArtistCard";
import { fieldClass, SectionHeading } from "@/components/ui";

const EMPTY: SearchResults = { artists: [], albums: [] };

/**
 * Searches MULO's catalogue as you type. Pressing Enter also runs the slower
 * search across all of MusicBrainz, whose results the page streams in below
 * as `children`, for anything MULO doesn't have yet.
 */
export default function SearchClient({
  initialQuery,
  initialResults,
  children,
}: {
  initialQuery: string;
  initialResults: SearchResults;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(initialResults);
  const [loading, setLoading] = useState(false);
  const lastSearched = useRef(initialQuery.trim());

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

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length >= 2) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const q = query.trim();
  const nothing =
    q.length >= 2 && !loading && results.artists.length === 0 && results.albums.length === 0;

  return (
    <div>
      <form onSubmit={submit} role="search" className="relative mb-10">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          autoComplete="off"
          placeholder="Search artists and albums"
          aria-label="Search artists and albums"
          className={`${fieldClass} h-12 pl-11 pr-24 text-base`}
        />
        {loading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-text-muted">
            Searching…
          </span>
        )}
      </form>

      {q.length < 2 && (
        <p className="text-sm text-text-secondary">
          Start typing the name of an artist or an album.
        </p>
      )}

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

      {nothing && (
        <p className="mb-10 text-sm text-text-secondary">
          Nothing in MULO matches &ldquo;{q}&rdquo; yet.
        </p>
      )}

      {q.length >= 2 &&
        (q === initialQuery.trim() ? (
          children
        ) : (
          <p className="text-sm text-text-muted">
            Press Enter to also search the whole MusicBrainz database.
          </p>
        ))}
    </div>
  );
}
