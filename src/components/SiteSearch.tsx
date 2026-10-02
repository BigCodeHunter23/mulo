"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SearchResults } from "@/lib/search";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";

/**
 * Search, from anywhere: a box in the header on wider screens, and a
 * full-screen sheet behind the search icon on phones. Both answer as you
 * type, from MULO's own catalogue. Enter on a highlighted row opens it;
 * Enter otherwise opens the search page, which also has songs, recent
 * searches and the wider music database.
 *
 * "/" or Ctrl/Cmd+K jumps to it from any page.
 */

const EMPTY: SearchResults = { artists: [], albums: [], songs: [] };

/** How many of each kind fit before the panel would rather be a page. */
const SHOW = { artists: 3, albums: 4, songs: 3 };

/** Asks the header's search to open, from anywhere on the page. */
const OPEN_EVENT = "mulo:open-search";

/** Tailwind's `md`: where the header has room for a box of its own. */
const WIDE = "(min-width: 768px)";

type Row = {
  key: string;
  href: string;
  title: string;
  sub: string;
  image: string | null;
  round: boolean;
};

function SearchIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** Whether a key press landed somewhere that takes typing. */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function SearchBox({
  variant,
  inputRef,
  autoFocus = false,
  onDone,
}: {
  /** "header": a compact box with a floating panel. "sheet": full width, results below. */
  variant: "header" | "sheet";
  inputRef: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  /** Called once somewhere has been chosen, or on Escape. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  /** The search MULO is being asked right now, so "Searching…" can't stick. */
  const [asked, setAsked] = useState<string | null>(null);
  const [open, setOpen] = useState(variant === "sheet");
  const [at, setAt] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);

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

  // A tap anywhere else puts the header's panel away.
  useEffect(() => {
    if (!open || variant === "sheet") return;
    function onDown(event: PointerEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open, variant]);

  function finish() {
    if (variant === "header") setOpen(false);
    setTerm("");
    setAt(-1);
    inputRef.current?.blur();
    onDone?.();
  }

  function go(href: string) {
    finish();
    router.push(href);
  }

  function everything() {
    if (q) go(`/search?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (variant === "header") setOpen(false);
      inputRef.current?.blur();
      onDone?.();
      return;
    }
    // Enter is handled here rather than left to the form: a box with no
    // submit button of its own can't be relied on to submit itself.
    if (event.key === "Enter") {
      event.preventDefault();
      if (at >= 0 && rows[at]) go(rows[at].href);
      else everything();
      return;
    }
    if (rows.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setAt((current) => (current + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setAt((current) => (current <= 0 ? rows.length - 1 : current - 1));
    }
  }

  const loading = asked !== null;
  const nothing = asking && !loading && rows.length === 0;
  const showPanel = open && asking;
  const listId = `${id}-results`;
  const rowId = (row: Row) => `${id}-${row.key}`;
  const sheet = variant === "sheet";

  return (
    <div ref={wrap} className={sheet ? "flex min-h-0 flex-1 flex-col" : "relative w-full"}>
      <form
        role="search"
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          if (at >= 0 && rows[at]) go(rows[at].href);
          else everything();
        }}
      >
        <label htmlFor={`${id}-input`} className="sr-only">
          Search artists, albums and songs
        </label>
        <SearchIcon
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-muted ${
            sheet ? "left-4 h-5 w-5" : "left-3 h-4 w-4"
          }`}
        />
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="search"
          value={term}
          autoFocus={autoFocus}
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
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={at >= 0 && rows[at] ? rowId(rows[at]) : undefined}
          aria-keyshortcuts={sheet ? undefined : "/ Control+K Meta+K"}
          placeholder={sheet ? "Search any artist, album or song" : "Search"}
          className={`peer w-full border bg-surface text-text transition-colors placeholder:text-text-muted focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&::-webkit-search-cancel-button]:hidden ${
            sheet
              ? "h-12 rounded-xl border-border-strong pl-12 text-base"
              : "h-9 rounded-full border-border pl-9 text-sm"
          } ${term ? "pr-20" : sheet ? "pr-4" : "pr-10"}`}
        />
        {/* The shortcut, shown while the box is idle. */}
        {!sheet && !term && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 text-[11px] leading-5 text-text-muted peer-focus:hidden"
          >
            /
          </kbd>
        )}
        <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {loading && <span className="text-xs text-text-muted">Searching…</span>}
          {term && (
            <button
              type="button"
              onClick={() => {
                setTerm("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              ×
            </button>
          )}
        </span>
      </form>

      {/* Said aloud to screen readers as results arrive. */}
      <p className="sr-only" aria-live="polite">
        {!asking || loading
          ? ""
          : nothing
            ? `Nothing in MULO for ${q} yet.`
            : `${rows.length} results.`}
      </p>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className={
            sheet
              ? "mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain"
              : "step-in absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[70vh] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border-strong bg-surface-raised/95 py-1.5 shadow-2xl backdrop-blur-xl"
          }
        >
          {rows.map((row, i) => (
            <Link
              key={row.key}
              id={rowId(row)}
              role="option"
              aria-selected={i === at}
              href={row.href}
              onClick={finish}
              onPointerMove={() => setAt(i)}
              className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                sheet ? "rounded-lg" : ""
              } ${i === at ? "bg-surface-hover" : "hover:bg-surface-hover"}`}
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
  );
}

/**
 * The search sheet on phones: the whole screen, so the keyboard and the
 * results both fit. Escape or Cancel closes it and hands focus back to the
 * search icon.
 */
function SearchSheet({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);

  // The page underneath stays put while the sheet is open.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  // Tab goes round the sheet rather than onto the page hidden behind it.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("input, button, a[href]"),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[60] flex flex-col bg-bg px-4 pb-[env(safe-area-inset-bottom)] pt-[calc(0.75rem+env(safe-area-inset-top))]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-2 text-sm font-medium text-text-secondary transition-colors hover:text-text"
          >
            Cancel
          </button>
        </div>
        <SearchBox variant="sheet" inputRef={input} autoFocus onDone={onClose} />
      </div>
    </div>
  );
}

export default function SiteSearch() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const desktopInput = useRef<HTMLInputElement>(null);
  const sheetButton = useRef<HTMLButtonElement>(null);

  // The search page has its own, bigger box.
  const onSearchPage = pathname === "/search";

  function closeSheet() {
    setSheetOpen(false);
    sheetButton.current?.focus();
  }

  // "/" (when not typing somewhere), Ctrl/Cmd+K and SearchPrompt all open
  // search: the header box where there's room, the sheet where there isn't.
  useEffect(() => {
    if (onSearchPage) return;
    function open() {
      if (window.matchMedia(WIDE).matches) desktopInput.current?.focus();
      else setSheetOpen(true);
    }
    function onKeyDown(event: KeyboardEvent) {
      const slash =
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !typingIn(event.target);
      const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (!slash && !commandK) return;
      event.preventDefault();
      open();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, open);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, open);
    };
  }, [onSearchPage]);

  if (onSearchPage) return null;

  return (
    <>
      <div className="hidden w-full max-w-xs md:block lg:max-w-sm">
        <SearchBox variant="header" inputRef={desktopInput} />
      </div>
      <button
        ref={sheetButton}
        type="button"
        aria-label="Search"
        aria-haspopup="dialog"
        onClick={() => setSheetOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-raised hover:text-text md:hidden"
      >
        <SearchIcon className="h-5 w-5" />
      </button>
      {sheetOpen && <SearchSheet onClose={closeSheet} />}
    </>
  );
}

/**
 * A big way into search, for the top of Discover: plenty of people arrive
 * there to look one record up. It opens the same search as the header.
 */
export function SearchPrompt() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="flex h-12 w-full items-center gap-3 rounded-xl border border-border-strong bg-surface px-4 text-left text-base text-text-muted transition-colors hover:border-accent/60 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <SearchIcon className="h-5 w-5 shrink-0 text-accent" />
      <span className="flex-1 truncate">Search any artist, album or song</span>
      <kbd
        aria-hidden="true"
        className="hidden rounded border border-border px-1.5 text-[11px] leading-5 md:inline"
      >
        /
      </kbd>
    </button>
  );
}
