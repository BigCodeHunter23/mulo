"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { saveTopPicks } from "./actions";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";
import { Crown, Sparks } from "@/components/Celebrate";
import ShareButton from "@/components/ShareButton";
import StoryButton from "@/components/StoryButton";
import { buttonClass, fieldClass } from "@/components/ui";
import Portal from "@/components/Portal";

type Kind = "artist" | "album";

export type PickItem = {
  mbid: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  /** Their own score, when the suggestion comes from their ratings. */
  score?: number | null;
};

const LIMIT = 10;

/**
 * Ranking by hand is the hard part, so the matchups do it: a binary insertion
 * sort where each comparison is "which of these two do you rate higher?".
 * Ten names take about twenty-five taps.
 */
type Ranking = {
  sorted: PickItem[];
  queue: PickItem[];
  current: PickItem;
  lo: number;
  hi: number;
  done: number;
  total: number;
};

function estimateTaps(count: number) {
  let total = 0;
  for (let i = 1; i < count; i++) total += Math.ceil(Math.log2(i + 1));
  return total;
}

function startRanking(items: PickItem[]): Ranking | null {
  if (items.length < 2) return null;
  return {
    sorted: [items[0]],
    queue: items.slice(2),
    current: items[1],
    lo: 0,
    hi: 1,
    done: 0,
    total: estimateTaps(items.length),
  };
}

/** Takes one answer; returns the next matchup, or the finished order. */
function answer(ranking: Ranking, currentWins: boolean) {
  const mid = Math.floor((ranking.lo + ranking.hi) / 2);
  let { sorted, queue, current } = ranking;
  let lo = currentWins ? ranking.lo : mid + 1;
  let hi = currentWins ? mid : ranking.hi;

  if (lo >= hi) {
    sorted = [...sorted.slice(0, lo), current, ...sorted.slice(lo)];
    if (queue.length === 0) return { next: null, order: sorted };
    current = queue[0];
    queue = queue.slice(1);
    lo = 0;
    hi = sorted.length;
  }

  return {
    next: { ...ranking, sorted, queue, current, lo, hi, done: ranking.done + 1 },
    order: null,
  };
}

function Art({
  item,
  round,
  size,
}: {
  item: PickItem;
  round: boolean;
  size: string;
}) {
  return (
    <span
      className={`artwork block shrink-0 overflow-hidden ${size} ${
        round ? "rounded-full" : "rounded-lg"
      }`}
    >
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          loading="lazy"
          className={`h-full w-full object-cover ${round ? "object-top" : ""}`}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-lg font-bold text-text-muted">
          {item.title.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

export default function GoatBuilder({
  kind,
  initial,
  suggestions,
  suggestionSource,
  username,
}: {
  kind: Kind;
  initial: PickItem[];
  suggestions: PickItem[];
  /** Whether the suggestions are their own ratings or popular names. */
  suggestionSource: "rated" | "popular";
  username: string;
}) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  // Which side just won a matchup, while the tap plays out.
  const [hit, setHit] = useState<boolean | null>(null);
  // The finished order, shown off before going back to the list.
  const [crowned, setCrowned] = useState<PickItem[] | null>(null);
  const [pending, startTransition] = useTransition();

  const round = kind === "artist";
  const noun = kind === "artist" ? "artists" : "albums";

  useEffect(() => {
    if (!crowned) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCrowned(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [crowned]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    const q = query.trim();
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          setResults(
            kind === "artist"
              ? (data.artists ?? []).map(
                  (a: { mbid: string; name: string; image_url: string | null }) => ({
                    mbid: a.mbid,
                    title: a.name,
                    subtitle: null,
                    image: artistPhotoSrc(a.image_url, 300),
                  }),
                )
              : (data.albums ?? []).map(
                  (a: {
                    mbid: string;
                    title: string;
                    artist: string | null;
                    cover_art_url: string | null;
                  }) => ({
                    mbid: a.mbid,
                    title: a.title,
                    subtitle: a.artist,
                    image: coverSrc(a.cover_art_url, 250),
                  }),
                ),
          );
        }
      } catch {
        // Superseded by a newer search; nothing to do.
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, kind]);

  function commit(next: PickItem[]) {
    const previous = items;
    setItems(next);
    setError(null);

    startTransition(async () => {
      const result = await saveTopPicks(kind, next.map((item) => item.mbid));
      if (result.ok) setSaved("Saved");
      else {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  function add(item: PickItem) {
    if (items.length >= LIMIT || items.some((i) => i.mbid === item.mbid)) return;
    commit([...items, item]);
  }

  function remove(mbid: string) {
    commit(items.filter((item) => item.mbid !== mbid));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  function matchup(currentWins: boolean) {
    if (!ranking || hit !== null) return;
    setHit(currentWins);

    // Let the winner flex before the next pair comes in.
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      setHit(null);
      const { next, order } = answer(ranking, currentWins);
      if (order) {
        setRanking(null);
        commit(order);
        setCrowned(order);
      } else {
        setRanking(next);
      }
    }, calm ? 0 : 320);
  }

  if (ranking) {
    const rival = ranking.sorted[Math.floor((ranking.lo + ranking.hi) / 2)];
    const progress = Math.min(
      100,
      Math.round((ranking.done / Math.max(ranking.total, 1)) * 100),
    );

    return (
      <div>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="display-sm text-lg text-text">
            Which do you rate higher?
          </h2>
          <button
            type="button"
            onClick={() => setRanking(null)}
            className="text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
          >
            Stop
          </button>
        </div>

        <div className="mb-6 h-1 overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          {[
            { item: ranking.current, wins: true },
            { item: rival, wins: false },
          ].map(({ item, wins }) => (
            <button
              key={`${item.mbid}-${ranking.done}`}
              type="button"
              onClick={() => matchup(wins)}
              disabled={hit !== null}
              className={`step-in group flex flex-col items-center gap-3 rounded-xl border bg-surface p-4 text-center transition-colors hover:border-accent sm:p-6 ${
                hit === null
                  ? "border-border"
                  : hit === wins
                    ? "match-win border-accent shadow-[0_0_40px_-8px_rgba(242,128,63,0.6)]"
                    : "match-lose border-border"
              }`}
            >
              <Art item={item} round={round} size="h-28 w-28 sm:h-40 sm:w-40" />
              <span className="display-sm line-clamp-2 text-sm text-text transition-colors group-hover:text-accent sm:text-base">
                {item.title}
              </span>
              {item.subtitle && (
                <span className="-mt-2 line-clamp-1 text-xs text-text-muted">
                  {item.subtitle}
                </span>
              )}
            </button>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-text-muted">
          Matchup {ranking.done + 1} of about {ranking.total}
        </p>
      </div>
    );
  }

  const full = items.length >= LIMIT;
  const picked = (item: PickItem) => items.some((i) => i.mbid === item.mbid);
  const searchingByName = query.trim().length >= 2;
  // Typing searches everything; otherwise the pool is their own ratings, best
  // first, or popular names for somebody who hasn't rated any yet.
  const showing = searchingByName
    ? results.filter((item) => !picked(item)).slice(0, 10)
    : suggestions.filter((item) => !picked(item));

  return (
    <div>
      {crowned && crowned.length > 0 && (
        <Portal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Your GOAT: ${crowned[0].title}`}
            onClick={() => setCrowned(null)}
            className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/85 p-6 backdrop-blur-sm"
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="flex w-full max-w-sm flex-col items-center text-center"
            >
              <p className="step-in text-xs font-semibold uppercase tracking-[0.22em] text-score-overall">
                {kind === "artist" ? "Your GOAT artist" : "Your GOAT album"}
              </p>

              <div className="relative mt-10">
                <Sparks />
                <span className="crown-drop absolute -top-10 left-1/2 z-20 -ml-7 block">
                  <Crown className="h-14 w-14" />
                </span>
                <span
                  className={`winner-rise goat-crown block ${round ? "rounded-full" : "rounded-lg"}`}
                >
                  <Art item={crowned[0]} round={round} size="h-44 w-44 sm:h-52 sm:w-52" />
                </span>
              </div>

              <p className="winner-rise display mt-6 text-3xl text-text" style={{ animationDelay: "0.25s" }}>
                {crowned[0].title}
              </p>
              {crowned[0].subtitle && (
                <p className="winner-rise text-sm text-text-muted" style={{ animationDelay: "0.3s" }}>
                  {crowned[0].subtitle}
                </p>
              )}

              {crowned.length > 1 && (
                <ol className="mt-7 flex items-start justify-center gap-4">
                  {crowned.slice(1, 3).map((item, i) => (
                    <li
                      key={item.mbid}
                      className="deal-in flex w-24 flex-col items-center gap-1.5"
                      style={{ "--delay": `${0.7 + i * 0.12}s` } as React.CSSProperties}
                    >
                      <Art item={item} round={round} size="h-16 w-16" />
                      <span className="text-xs font-bold tabular-nums text-text-muted">{i + 2}</span>
                      <span className="line-clamp-1 text-xs text-text-secondary">{item.title}</span>
                    </li>
                  ))}
                </ol>
              )}

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <ShareButton
                  url={`/u/${username}`}
                  title="My GOAT on MULO"
                  text={`My number one: ${crowned[0].title}.`}
                  label="Share it"
                />
                <StoryButton src={`/u/${username}/goat/story?kind=${kind}&v=${crowned.slice(0, 5).map((pick) => pick.mbid.slice(0, 6)).join("")}`} filename="my-goat" />
                <button type="button" onClick={() => setCrowned(null)} className={buttonClass({ size: "sm" })}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="display-sm text-lg text-text">
          Your top {LIMIT}
          <span className="ml-2 text-sm font-normal text-text-muted">
            {items.length} of {LIMIT}
          </span>
        </h2>
        <div className="flex items-center gap-3 text-sm">
          <span aria-live="polite" className="text-text-muted">
            {pending ? "Saving…" : saved ? <span className="text-success">✓ {saved}</span> : null}
          </span>
          <button
            type="button"
            onClick={() => setRanking(startRanking(items))}
            disabled={items.length < 2 || pending}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Rank by matchups
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-score-you">{error}</p>}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface/40 px-5 py-8 text-center text-sm text-text-secondary">
          Nothing picked yet. Search below, or tap one of your highest-rated{" "}
          {noun}.
        </p>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-border">
          {items.map((item, i) => (
            <li
              key={item.mbid}
              className={`flex items-center gap-3 px-3 py-2.5 sm:px-4 ${
                i % 2 ? "bg-surface/40" : ""
              } ${i === 0 ? "bg-score-overall/10" : ""}`}
            >
              <span
                className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${
                  i === 0 ? "rank-pop text-score-overall" : "text-text-muted"
                }`}
              >
                {i + 1}
              </span>
              <Art item={item} round={round} size={i === 0 ? "h-12 w-12" : "h-10 w-10"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text">{item.title}</span>
                {item.subtitle && (
                  <span className="block truncate text-xs text-text-muted">
                    {item.subtitle}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || pending}
                  aria-label={`Move ${item.title} up`}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1 || pending}
                  aria-label={`Move ${item.title} down`}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(item.mbid)}
                  disabled={pending}
                  aria-label={`Remove ${item.title}`}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-score-you disabled:opacity-30"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {items.length > 0 && (
          <ShareButton
            url={`/u/${username}`}
            title="My GOAT on MULO"
            text="My top ten, ranked."
            label="Share your GOAT"
          />
        )}
        {items.length > 0 && <StoryButton src={`/u/${username}/goat/story?kind=${kind}&v=${items.slice(0, 5).map((pick) => pick.mbid.slice(0, 6)).join("")}`} filename="my-goat" />}
        <Link
          href={`/u/${username}`}
          className="text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
        >
          See it on your profile →
        </Link>
      </div>

      <div className="mt-10">
        <label
          htmlFor="goat-search"
          className="text-xs font-medium uppercase tracking-wider text-text-secondary"
        >
          Add {noun}
        </label>
        <div className="relative mt-2">
          <input
            id="goat-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            placeholder={kind === "artist" ? "Search artists" : "Search albums"}
            className={`${fieldClass} h-11`}
            disabled={full}
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
              Searching…
            </span>
          )}
        </div>

        {full && (
          <p className="mt-2 text-xs text-text-muted">
            Your list is full. Remove one to add another.
          </p>
        )}

        {!full && !searchingByName && showing.length > 0 && (
          <p className="mt-5 text-xs text-text-muted">
            {suggestionSource === "rated"
              ? `Every ${kind} you've rated, highest first`
              : "Popular picks to start you off"}
          </p>
        )}

        {!full && searchingByName && !searching && showing.length === 0 && (
          <p className="mt-5 text-xs text-text-muted">
            Nothing on MULO matches that yet.
          </p>
        )}

        {!full && showing.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5">
            {showing.map((item) => (
              <li key={item.mbid}>
                <button
                  type="button"
                  onClick={() => add(item)}
                  className="group flex w-full flex-col items-center gap-2 text-center"
                >
                  <span className="relative block w-full">
                    <Art item={item} round={round} size="aspect-square w-full" />
                    <span
                      className={`absolute inset-0 flex items-center justify-center bg-bg/70 text-2xl font-bold text-accent opacity-0 transition-opacity group-hover:opacity-100 ${
                        round ? "rounded-full" : "rounded-lg"
                      }`}
                    >
                      +
                    </span>
                    {item.score != null && (
                      <span className="absolute right-0 top-0 rounded-md bg-score-you px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#0b0b0e]">
                        {item.score}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 text-xs text-text transition-colors group-hover:text-accent">
                    {item.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
