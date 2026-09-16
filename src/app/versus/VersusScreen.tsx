import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  dayLabel,
  getMatchupForDay,
  getVersusView,
  shiftDay,
} from "@/lib/versus";
import { leader, shares, type VersusMatchup } from "@/lib/versus-shared";
import VersusCard from "@/components/VersusCard";
import VersusFaces from "@/components/VersusFaces";
import ShareButton from "@/components/ShareButton";
import { SectionHeading } from "@/components/ui";

export function versusMetadata(matchup: VersusMatchup): Metadata {
  const title = `${matchup.left.name} vs ${matchup.right.name}`;
  const description = `${matchup.tagline ? `${matchup.tagline}. ` : ""}Who you got? Pick a side in the Daily Versus on MULO.`;
  const image = `/versus/${matchup.day}/opengraph-image`;

  return {
    title: `${title} · Daily Versus`,
    description,
    openGraph: { type: "website", siteName: "MULO", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/** Yesterday's result, in brief, under today's matchup. */
async function Yesterday({ day }: { day: string }) {
  const matchup = await getMatchupForDay(day);
  if (!matchup) return null;

  const view = await getVersusView(matchup);
  if (!view.tally) return null;

  const split = shares(view.tally);
  if (split.total === 0) return null;
  const ahead = leader(view.tally);

  return (
    <section className="mt-14">
      <SectionHeading>Yesterday</SectionHeading>
      <Link
        href={`/versus/${day}`}
        className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-raised"
      >
        <VersusFaces matchup={matchup} winner={ahead} />
        <span className="min-w-0 flex-1">
          <span className="display-sm block truncate text-sm text-text transition-colors group-hover:text-accent">
            {matchup.left.name} vs {matchup.right.name}
          </span>
          <span className="mt-0.5 block text-sm text-text-secondary">
            {ahead ? `${matchup[ahead].name} took it with ${split[ahead]}%` : "Dead even"}
            {` · ${split.total} ${split.total === 1 ? "pick" : "picks"}`}
          </span>
          {view.mine && (
            <span className="mt-0.5 block text-xs text-text-muted">
              {view.mine === ahead
                ? "You called it."
                : `You picked ${matchup[view.mine].name}.`}
            </span>
          )}
        </span>
        <span aria-hidden="true" className="text-text-muted">
          →
        </span>
      </Link>
    </section>
  );
}

/** One day's matchup: open for picks today, or its final result afterwards. */
export default async function VersusScreen({ matchup }: { matchup: VersusMatchup }) {
  const view = await getVersusView(matchup);
  const { left, right } = matchup;

  let subline = matchup.tagline ? `${matchup.tagline}. Who you got?` : "Who you got?";
  if (view.closed && view.tally) {
    const ahead = leader(view.tally);
    const split = shares(view.tally);
    if (split.total === 0) subline = "Nobody picked this one.";
    else if (ahead) subline = `${matchup[ahead].name} took it with ${split[ahead]}%.`;
    else subline = "Finished dead even.";
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Daily Versus
          <span className="text-text-muted">
            {" · "}
            {view.closed ? dayLabel(matchup.day) : "Today"}
          </span>
        </p>
        <h1 className="display mt-2 text-3xl text-text sm:text-5xl">
          {left.name} <span className="text-text-muted">vs</span> {right.name}
        </h1>
        <p className="mt-2 text-sm text-text-secondary sm:text-base">{subline}</p>
      </header>

      <VersusCard view={view} />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <ShareButton
          url={`/versus/${matchup.day}`}
          title={`${left.name} vs ${right.name}`}
          text={
            view.closed
              ? `${left.name} vs ${right.name}: the result on MULO`
              : `${left.name} vs ${right.name}. Who you got?`
          }
        />
        {view.closed && (
          <Link
            href="/versus"
            className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Today&rsquo;s Versus →
          </Link>
        )}
      </div>

      {!view.closed && (
        <Suspense fallback={null}>
          <Yesterday day={shiftDay(matchup.day, -1)} />
        </Suspense>
      )}
    </main>
  );
}
