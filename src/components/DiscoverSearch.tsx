"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The way into search, at the top of Discover.
 *
 * Looking something up and browsing around are the same errand — you open the
 * app wanting a record — so they belong on the same screen rather than behind
 * a separate tab. Typing here hands over to the search page, which already
 * does the work; this is the door, not a second search.
 */
export default function DiscoverSearch() {
  const router = useRouter();
  const [term, setTerm] = useState("");

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const query = term.trim();
        if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
      }}
      className="relative"
    >
      <label htmlFor="discover-search" className="sr-only">
        Search artists, albums and songs
      </label>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id="discover-search"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        enterKeyHint="search"
        placeholder="Artists, albums, songs"
        className="w-full rounded-full border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
      />
    </form>
  );
}
