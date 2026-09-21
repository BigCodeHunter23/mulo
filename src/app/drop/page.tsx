import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCachedRelease, getCachedTracks } from "@/lib/catalog";
import { currentDrop, getDropResults } from "@/lib/drop";
import { getOwnRating } from "@/lib/ratings";
import { getReviews } from "@/lib/reviews";
import { getReactions } from "@/lib/reactions";
import { getCurrentUser } from "@/lib/supabase/server";
import { coverSrc } from "@/lib/cover-url";
import Countdown from "@/components/Countdown";
import RatingForm from "@/components/RatingForm";
import RecordDisc from "@/components/RecordDisc";
import { PlayButton, PreviewCredit } from "@/components/PreviewPlayer";
import ReviewList from "@/components/ReviewList";
import { SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const drop = currentDrop();
  return {
    title: `The Drop: ${drop.album.title}`,
    description: `This week everybody on MULO is rating ${drop.album.title} by ${drop.album.artist}.`,
  };
}

/** How many people gave each score, as bars — yours in red, everyone's in gold. */
function Spread({ spread, yours }: { spread: number[]; yours: number | null }) {
  const most = Math.max(1, ...spread);
  return (
    <div className="flex h-40 items-end gap-1.5 sm:gap-2" role="img" aria-label="How everybody scored it">
      {spread.map((count, i) => {
        const score = i + 1;
        const mine = score === yours;
        return (
          <div key={score} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[10px] tabular-nums text-text-muted">{count || ""}</span>
            <div
              className={`drop-bar w-full rounded-t-md ${
                mine ? "bg-score-you" : count ? "bg-score-overall/70" : "bg-surface-raised"
              }`}
              style={
                {
                  height: `${Math.max((count / most) * 100, 4)}%`,
                  "--at": `${0.1 + i * 0.05}s`,
                } as React.CSSProperties
              }
            />
            <span
              className={`text-xs font-semibold tabular-nums ${mine ? "text-score-you" : "text-text-secondary"}`}
            >
              {score}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The Drop: this week's album, rated by everybody together. The crowd's
 * scores stay hidden until you've given yours, so nobody's anchored by them.
 */
export default async function DropPage() {
  const drop = currentDrop();
  const { mbid } = drop.album;
  const user = await getCurrentUser();

  const [release, results, ownRating, reviews] = await Promise.all([
    getCachedRelease(mbid),
    getDropResults(drop),
    getOwnRating("album", mbid),
    getReviews("album", mbid),
  ]);
  const reactions = await getReactions(
    "album",
    reviews.map((review) => review.id),
  );

  // The best takes first: the ones people loved most.
  const takes = [...reviews]
    .sort((a, b) => (reactions[b.id]?.love ?? 0) - (reactions[a.id]?.love ?? 0))
    .slice(0, 6);

  const cover = coverSrc(release?.cover_art_url ?? null, 500);
  const revealed = results.yours !== null;
  const year = release?.release_date?.slice(0, 4);

  return (
    <>
      <div className="relative overflow-hidden">
        <div className="backdrop h-[520px]">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" aria-hidden="true" />
          )}
        </div>

        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-10 text-center sm:px-6">
          <p className="drop-eyebrow text-xs font-semibold uppercase tracking-[0.35em] text-accent">
            The Drop &middot; Week {drop.week}
          </p>

          {/* The sleeve, with the record sliding out from behind it */}
          <div className="relative mt-8 h-56 w-56 sm:h-72 sm:w-72">
            <div className="drop-record absolute inset-0">
              <RecordDisc cover={release?.cover_art_url ?? null} className="h-full w-full" spinning />
            </div>
            <div className="drop-sleeve artwork relative h-full w-full overflow-hidden rounded-lg shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt={drop.album.title} className="h-full w-full object-cover" />
              )}
            </div>
          </div>

          <h1 className="drop-title display mt-10 text-3xl text-text sm:text-5xl">
            <Link href={`/album/${mbid}`} className="transition-colors hover:text-accent">
              {drop.album.title}
            </Link>
          </h1>
          <p className="drop-title mt-2 text-base text-text-secondary">
            {drop.album.artist}
            {year && ` · ${year}`}
          </p>
          <div className="drop-title mt-4 text-sm text-text-muted">
            <Countdown until={drop.closesAt} now={drop.now} prefix="Next drop in" />
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-10 sm:px-6">
        <p className="mb-6 text-center text-sm text-text-secondary">
          Everybody on MULO is rating this one this week.{" "}
          {revealed ? "Here's how it's landing." : "Give it your score to see how everyone else did."}
        </p>

        <RatingForm key={mbid} kind="album" mbid={mbid} signedIn={Boolean(user)} existing={ownRating} />

        {/* The record itself, so nobody has to leave the page to remember how
            it goes. The first visit of a week fetches the tracklist from
            MusicBrainz, so it streams in rather than holding up the score. */}
        <Suspense fallback={null}>
          <DropTracklist mbid={mbid} artist={drop.album.artist} title={drop.album.title} />
        </Suspense>

        <section className="mt-12">
          <SectionHeading
            action={
              <span className="text-xs tabular-nums text-text-muted">
                {results.count} rated &middot; {results.thisWeek} this week
              </span>
            }
          >
            How it&rsquo;s landing
          </SectionHeading>

          {revealed ? (
            <div className="grid items-end gap-8 sm:grid-cols-[auto_1fr]">
              <div className="text-center sm:text-left">
                <p className="display text-6xl tabular-nums text-score-overall">
                  {results.average?.toFixed(1) ?? "–"}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.15em] text-text-muted">
                  Everyone &middot; you gave it{" "}
                  <span className="font-semibold text-score-you">{results.yours}</span>
                </p>
              </div>
              <Spread spread={results.spread} yours={results.yours} />
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-border">
              {/* A blurred stand-in, so it's plain something's waiting there */}
              <div aria-hidden="true" className="flex h-40 items-end gap-2 p-4 blur-md">
                {[2, 3, 5, 8, 12, 9, 6, 4, 2, 1].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-md bg-score-overall/50" style={{ height: `${h * 8}%` }} />
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-bg/40">
                <p className="rounded-full border border-border-strong bg-surface-raised/90 px-4 py-2 text-sm text-text">
                  {user ? "Rate it above to see the spread" : "Log in and rate it to see the spread"}
                </p>
              </div>
            </div>
          )}
        </section>

        {revealed && takes.length > 0 && (
          <section className="mt-12">
            <SectionHeading>The best takes</SectionHeading>
            <ReviewList reviews={takes} kind="album" signedIn={Boolean(user)} reactions={reactions} />
          </section>
        )}
      </main>
    </>
  );
}

/**
 * The week's record, track by track, with Apple's thirty-second previews.
 *
 * The Drop asks everybody to rate the same album, which only works if people
 * can actually hear it — a cover and a title is not enough to score something
 * honestly.
 */
async function DropTracklist({
  mbid,
  artist,
  title,
}: {
  mbid: string;
  artist: string | null;
  title: string;
}) {
  const tracks = await getCachedTracks(mbid);
  if (tracks.length === 0) return null;

  return (
    <section className="mt-12">
      <SectionHeading
        action={
          <span className="text-xs tabular-nums text-text-muted">{tracks.length} songs</span>
        }
      >
        Tracklist
      </SectionHeading>

      <ol className="flex flex-col gap-1">
        {tracks.map((track) => (
          <li
            key={`${track.position}-${track.title}`}
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface/40 px-3 py-2"
          >
            <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-text-muted">
              {track.position}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-text">{track.title}</span>
            {artist && (
              <PlayButton
                artist={artist}
                title={track.title}
                album={title}
                anchor={tracks[0]?.title}
                scope={`drop-${mbid}`}
              />
            )}
          </li>
        ))}
      </ol>

      <PreviewCredit scope={`drop-${mbid}`} className="mt-3" />
    </section>
  );
}
