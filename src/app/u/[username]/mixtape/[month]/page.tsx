import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfileByUsername } from "@/lib/social";
import {
  currentMonth,
  getMixtape,
  monthLabel,
  MONTH_PATTERN,
  shiftMonth,
  type MixtapePick,
} from "@/lib/mixtape";
import Avatar from "@/components/Avatar";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; month: string }>;
}): Promise<Metadata> {
  const { username, month } = await params;
  if (!MONTH_PATTERN.test(month)) return { title: "Mixtape" };

  const profile = await getProfileByUsername(username);
  if (!profile) return { title: "Mixtape" };

  const name = profile.display_name || profile.username;
  const title = `${name}'s mixtape — ${monthLabel(month)}`;
  const description = `${name}'s ${monthLabel(month)} mixtape on MULO: the albums, songs and artists they rated.`;

  return {
    title,
    description,
    openGraph: { type: "website", siteName: "MULO", title, description },
  };
}

function Art({
  pick,
  round,
  size,
}: {
  pick: MixtapePick;
  round: boolean;
  size: string;
}) {
  return (
    <span
      className={`artwork block shrink-0 overflow-hidden ${size} ${
        round ? "rounded-full" : "rounded-lg"
      } transition-transform group-hover:scale-[1.03]`}
    >
      {pick.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pick.image}
          alt=""
          className={`h-full w-full object-cover ${round ? "object-top" : ""}`}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-text-muted">
          {pick.title.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function Feature({
  label,
  pick,
  round = false,
  detail,
}: {
  label: string;
  pick: MixtapePick;
  round?: boolean;
  detail?: string;
}) {
  return (
    <Link
      href={pick.href}
      className="group flex flex-col items-center rounded-xl border border-border bg-surface p-5 text-center transition-colors hover:border-border-strong"
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
        {label}
      </span>
      <span className="mt-4">
        <Art pick={pick} round={round} size="h-28 w-28" />
      </span>
      <span className="display-sm mt-3.5 line-clamp-2 text-sm text-text transition-colors group-hover:text-accent">
        {pick.title}
      </span>
      {pick.subtitle && (
        <span className="line-clamp-1 text-xs text-text-muted">{pick.subtitle}</span>
      )}
      <span className="mt-2.5 text-sm">
        {detail ? (
          <span className="text-text-muted">{detail}</span>
        ) : (
          <span className="display-sm tabular-nums text-score-you">
            {pick.score}
            <span className="text-[10px] text-text-muted">/10</span>
          </span>
        )}
      </span>
    </Link>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="display-sm text-lg tabular-nums text-text">{value}</span>
      <span className="text-xs uppercase tracking-wider text-text-muted">{label}</span>
    </div>
  );
}

/**
 * One month of somebody's listening, as a page worth sending to a friend.
 * Each month has its own address, so a shared link always previews the month
 * it points at.
 */
export default async function MixtapePage({
  params,
}: {
  params: Promise<{ username: string; month: string }>;
}) {
  const { username, month } = await params;
  if (!MONTH_PATTERN.test(month)) notFound();

  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const tape = await getMixtape(profile.id, month);
  const name = profile.display_name || profile.username;
  const rated = tape.albums + tape.songs + tape.artists;

  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const path = (target: string) => `/u/${username}/mixtape/${target}`;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <div className="flex items-center gap-3">
        <Link href={`/u/${username}`} className="flex items-center gap-3">
          <Avatar url={profile.avatar_url} name={name} size="md" />
          <span className="text-sm font-medium text-text transition-colors hover:text-accent">
            {name}
          </span>
        </Link>
        <span className="text-xs uppercase tracking-[0.15em] text-text-muted">
          Mixtape
        </span>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <Link
          href={path(previous)}
          aria-label={`Mixtape for ${monthLabel(previous)}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          ←
        </Link>
        <h1 className="display text-3xl text-text sm:text-4xl">{tape.label}</h1>
        {next <= currentMonth() && (
          <Link
            href={path(next)}
            aria-label={`Mixtape for ${monthLabel(next)}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-border-strong hover:text-text"
          >
            →
          </Link>
        )}
      </div>

      {rated === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Blank tape"
            body={`Nothing rated in ${tape.label} yet.`}
            action={<ButtonLink href={path(previous)}>See {monthLabel(previous)}</ButtonLink>}
          />
        </div>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap gap-7">
            <Stat value={tape.albums} label="Albums" />
            <Stat value={tape.songs} label="Songs" />
            <Stat value={tape.artists} label="Artists" />
            {tape.average !== null && (
              <Stat value={tape.average.toFixed(1)} label="Avg score" />
            )}
          </div>

          {(tape.topAlbum || tape.topSong || tape.topArtist) && (
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {tape.topAlbum && (
                <Feature label="Album of the month" pick={tape.topAlbum} />
              )}
              {tape.topSong && (
                <Feature label="Track of the month" pick={tape.topSong} />
              )}
              {tape.topArtist && (
                <Feature
                  label="On repeat"
                  pick={tape.topArtist}
                  round
                  detail={`${tape.topArtist.rated} ratings this month`}
                />
              )}
            </div>
          )}

          {tape.highlights.length > 0 && (
            <section className="mt-14">
              <SectionHeading>Full tracklist</SectionHeading>
              <ul className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-4 lg:grid-cols-6">
                {tape.highlights.map((pick) => (
                  <li key={pick.key}>
                    <Link href={pick.href} className="group block">
                      <Art
                        pick={pick}
                        round={pick.key.startsWith("artist-")}
                        size="aspect-square w-full"
                      />
                      <p className="display-sm mt-2.5 line-clamp-1 text-sm text-text transition-colors group-hover:text-accent">
                        {pick.title}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-text-muted">
                          {pick.subtitle}
                        </span>
                        <span className="display-sm shrink-0 text-xs tabular-nums text-score-you">
                          {pick.score}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
