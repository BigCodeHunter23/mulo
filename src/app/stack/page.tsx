import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import Link from "next/link";
import { getStack } from "@/lib/stack";
import { GENRE_FAMILIES } from "@/lib/badge-catalog";
import { getStreak } from "@/lib/streak";
import StreakFlame from "@/components/StreakFlame";
import StackDeck from "./StackDeck";
import { ButtonLink, EmptyState } from "@/components/ui";

export const metadata: Metadata = {
  title: "The Stack",
  description: "A quick run of records to rate, picked for you.",
};

/**
 * Long enough to be worth opening, short enough to finish in a sitting.
 *
 * Forty was a slog. A run nobody reaches the end of always feels like
 * homework, and the end of a run — where the ranking sits and another run is
 * one tap away — is the part that makes somebody go again. Ten takes a couple
 * of minutes and ends on that.
 */
const RUN = 10;

const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020];

/**
 * A run is never reused. `getStack` leaves out anything already rated, and
 * draws a different handful each time, so a cached page would hand somebody
 * the run they just finished.
 */
export const dynamic = "force-dynamic";

export default async function StackPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; decade?: string; genre?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // "Another run" points at a new ?run= value. The address has to change for
  // the deck to be built again rather than left sitting on its finished
  // screen, and the value keys the deck so its state starts over.
  const { run, decade: decadeParam, genre: genreParam } = await searchParams;
  const decade = DECADES.includes(Number(decadeParam)) ? Number(decadeParam) : null;
  const genre = GENRE_FAMILIES.some((f) => f.id === genreParam) ? genreParam! : null;
  const [albums, streak] = await Promise.all([
    getStack(user.id, RUN, { decade, genre }),
    getStreak(user.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          The Stack
        </p>
        <h1 className="display mt-2 text-3xl text-text sm:text-4xl">
          Rate what you know
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
          Records picked for you, one at a time. Score the ones you know, wave
          off the ones you don&rsquo;t.
        </p>
        <div className="mt-4 flex justify-center empty:hidden">
          <StreakFlame streak={streak} isSelf />
        </div>
      </header>

      <Filters decade={decade} genre={genre} />

      {albums.length === 0 ? (
        decade || genre ? (
          <EmptyState
            title="Nothing left for that mix"
            body="You've rated everything MULO has lined up there. Try another decade or genre."
            action={<ButtonLink href="/stack">Clear filters</ButtonLink>}
          />
        ) : (
          <EmptyState
            title="Nothing left in the stack"
            body="You've rated everything MULO had lined up for you. Go digging and it'll fill back up."
            action={<ButtonLink href="/discover">Find something new</ButtonLink>}
          />
        )
      ) : (
        <StackDeck
          key={`${run ?? "first"}-${decade ?? ""}-${genre ?? ""}`}
          albums={albums}
          runId={Number(run) || 0}
          filters={`${decade ? `&decade=${decade}` : ""}${genre ? `&genre=${genre}` : ""}`}
        />
      )}
    </main>
  );
}

/**
 * Narrow a run to one decade or one genre, or both. Plain links, so the
 * address says what the run is and a phone's back button undoes a pick.
 */
function Filters({ decade, genre }: { decade: number | null; genre: string | null }) {
  const href = (next: { decade?: number | null; genre?: string | null }) => {
    const d = next.decade === undefined ? decade : next.decade;
    const g = next.genre === undefined ? genre : next.genre;
    const params = new URLSearchParams();
    if (d) params.set("decade", String(d));
    if (g) params.set("genre", g);
    const query = params.toString();
    return query ? `/stack?${query}` : "/stack";
  };
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      active
        ? "border-accent bg-accent/15 text-accent"
        : "border-border text-text-secondary hover:border-border-strong hover:text-text"
    }`;

  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="rail -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
        <Link href={href({ decade: null })} className={chip(decade === null)} scroll={false}>
          Any decade
        </Link>
        {DECADES.map((d) => (
          <Link key={d} href={href({ decade: d })} className={chip(decade === d)} scroll={false}>
            {String(d).slice(2)}s
          </Link>
        ))}
      </div>
      <div className="rail -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
        <Link href={href({ genre: null })} className={chip(genre === null)} scroll={false}>
          Any genre
        </Link>
        {GENRE_FAMILIES.map((family) => (
          <Link
            key={family.id}
            href={href({ genre: family.id })}
            className={chip(genre === family.id)}
            scroll={false}
          >
            {family.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
