"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { backNomination, nominateMatchup } from "./actions";
import type { Nomination } from "@/lib/nominations";
import { artistPhotoSrc } from "@/lib/cover-url";
import { buttonClass, fieldClass } from "@/components/ui";
import { haptic } from "@/lib/haptics";

type Artist = { mbid: string; name: string; image_url: string | null };

/**
 * Matchups people want to see. Anyone can put two artists forward or back one
 * already there; the most-backed rise to the top, and the best of them become
 * future Daily Versus days.
 */
export default function Nominations({
  nominations: initial,
  signedIn,
}: {
  nominations: Nomination[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [nominations, setNominations] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Fresh numbers from the server after a nomination replace the local ones.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setNominations(initial);
  }

  function toggle(nomination: Nomination) {
    haptic("tap");
    if (!signedIn) {
      router.push("/login");
      return;
    }
    const back = !nomination.mine;
    const apply = (on: boolean) =>
      setNominations((current) =>
        current.map((n) =>
          n.id === nomination.id ? { ...n, mine: on, backers: n.backers + (on === n.mine ? 0 : on ? 1 : -1) } : n,
        ),
      );
    setError(null);
    apply(back);
    startTransition(async () => {
      const result = await backNomination(nomination.id, back);
      if (!result.ok) {
        setError(result.error);
        apply(!back);
      }
    });
  }

  return (
    <section className="mt-14">
      <h2 className="display-sm text-xl text-text">Nominate a matchup</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Who should go head to head next? The most-backed matchups make it into the Daily Versus.
      </p>

      <NominateForm signedIn={signedIn} onDone={() => router.refresh()} />

      {error && <p className="mt-3 text-sm text-score-you">{error}</p>}

      {nominations.length > 0 && (
        <ol className="mt-6 flex flex-col gap-2">
          {nominations.map((nomination) => (
            <li
              key={nomination.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <div className="flex shrink-0 -space-x-2">
                <Face artist={nomination.left} />
                <Face artist={nomination.right} />
              </div>
              <p className="min-w-0 flex-1 text-sm text-text">
                <Link href={`/artist/${nomination.left.mbid}`} className="font-medium hover:text-accent">
                  {nomination.left.name}
                </Link>{" "}
                <span className="text-accent">vs</span>{" "}
                <Link href={`/artist/${nomination.right.mbid}`} className="font-medium hover:text-accent">
                  {nomination.right.name}
                </Link>
              </p>
              <button
                type="button"
                onClick={() => toggle(nomination)}
                aria-pressed={nomination.mine}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold tabular-nums transition-colors ${
                  nomination.mine
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border-strong text-text-secondary hover:border-accent hover:text-accent"
                }`}
              >
                ▲ {nomination.backers}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Face({ artist }: { artist: { name: string; image: string | null } }) {
  const src = artistPhotoSrc(artist.image, 96);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="h-9 w-9 rounded-full object-cover object-top ring-2 ring-surface" />
  ) : (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised text-xs font-bold text-text-muted ring-2 ring-surface">
      {artist.name.charAt(0).toUpperCase()}
    </span>
  );
}

function NominateForm({ signedIn, onDone }: { signedIn: boolean; onDone: () => void }) {
  const [left, setLeft] = useState<Artist | null>(null);
  const [right, setRight] = useState<Artist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Link href="/login" className={`${buttonClass({ variant: "secondary", size: "sm" })} mt-4`}>
        Log in to nominate
      </Link>
    );
  }

  function submit() {
    haptic("select");
    if (!left || !right) return;
    setError(null);
    startTransition(async () => {
      const result = await nominateMatchup(left.mbid, right.mbid);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLeft(null);
      setRight(null);
      setDone(true);
      onDone();
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-3">
      <div className="grid items-start gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <ArtistPicker value={left} onChange={(a) => { setLeft(a); setDone(false); }} placeholder="First artist" />
        <span className="self-center text-center text-sm font-semibold text-accent">vs</span>
        <ArtistPicker value={right} onChange={(a) => { setRight(a); setDone(false); }} placeholder="Second artist" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!left || !right || pending}
          onClick={submit}
          className={buttonClass({ size: "sm" })}
        >
          {pending ? "Sending…" : "Nominate"}
        </button>
        {done && <span className="text-sm text-success">✓ Nominated. It&rsquo;s in the list below.</span>}
        {error && <span className="text-sm text-score-you">{error}</span>}
      </div>
    </div>
  );
}

/** A search box that turns into the chosen artist, with a way to change it. */
function ArtistPicker({
  value,
  onChange,
  placeholder,
}: {
  value: Artist | null;
  onChange: (artist: Artist | null) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Artist[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = (await response.json()) as { artists?: Artist[] };
        setFound((body.artists ?? []).slice(0, 5));
      } catch {
        // Cancelled or failed: keep what's shown.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border-strong bg-surface-raised px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-text-muted underline-offset-4 hover:text-text hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  const results = query.trim().length < 2 ? [] : found;

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={fieldClass}
      />
      {results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border-strong bg-surface-raised shadow-xl">
          {results.map((artist) => (
            <li key={artist.mbid}>
              <button
                type="button"
                onClick={() => {
                  onChange(artist);
                  setQuery("");
                }}
                className="block w-full truncate px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
              >
                {artist.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
