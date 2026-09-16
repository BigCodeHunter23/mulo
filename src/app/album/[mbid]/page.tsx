import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getCachedArtist,
  getCachedRelease,
  getCachedTracks,
} from "@/lib/catalog";
import { getOwnRating, getScores, getSongScores } from "@/lib/ratings";
import { getReviews } from "@/lib/reviews";
import { getReactions } from "@/lib/reactions";
import { getCurrentUser } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import StarScore from "@/components/StarScore";
import RatingForm from "@/components/RatingForm";
import ReviewList from "@/components/ReviewList";
import { SkeletonLine } from "@/components/Skeleton";
import { SectionHeading } from "@/components/ui";
import SongList from "./SongList";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mbid: string }>;
}): Promise<Metadata> {
  const { mbid } = await params;
  const { data } = await createPublicClient()
    .from("releases")
    .select("title, release_date, artists ( name )")
    .eq("mbid", mbid)
    .maybeSingle();

  if (!data) return { title: "Album" };

  // Without generated database types, supabase-js can't tell this join is
  // many-to-one and types it as a list, so handle either shape.
  const joined = data.artists as unknown as
    | { name: string }
    | { name: string }[]
    | null;
  const artist = Array.isArray(joined) ? joined[0]?.name : joined?.name;
  const year = (data.release_date as string | null)?.slice(0, 4);
  const title = artist ? `${data.title} — ${artist}` : String(data.title);
  const description = `${data.title}${artist ? ` by ${artist}` : ""}${
    year ? ` (${year})` : ""
  }. Rate and review it on MULO.`;

  return {
    title,
    description,
    openGraph: { type: "website", siteName: "MULO", title, description },
  };
}

function totalRuntime(tracks: { duration_ms: number | null }[]) {
  const ms = tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  if (ms === 0) return null;
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;

  const release = await getCachedRelease(mbid);
  if (!release) notFound();

  const user = await getCurrentUser();
  const signedIn = Boolean(user);

  const [artist, scores, ownRating, reviews] = await Promise.all([
    release.artist_mbid ? getCachedArtist(release.artist_mbid) : null,
    getScores("album", mbid),
    getOwnRating("album", mbid),
    getReviews("album", mbid),
  ]);

  const reactions = await getReactions(
    "album",
    reviews.map((review) => review.id),
  );
  const year = release.release_date?.slice(0, 4);

  return (
    <>
      {/* The artwork, blurred and blown up, bleeding out behind the header. */}
      <div className="relative">
        <div className="backdrop h-[420px]">
          {release.cover_art_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={release.cover_art_url} alt="" aria-hidden="true" />
          )}
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
          <div className="flex flex-col gap-7 sm:flex-row sm:gap-9">
            <div className="artwork aspect-square w-44 shrink-0 overflow-hidden rounded-xl sm:w-60">
              {release.cover_art_url && (
                /* Cover Art Archive redirects to archive.org, so Next's
                   image optimizer adds nothing here. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={release.cover_art_url}
                  alt={release.title}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-5 pb-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                  Album
                </p>
                <h1 className="display mt-2 text-4xl text-text sm:text-5xl">
                  {release.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
                  {artist && (
                    <Link
                      href={`/artist/${artist.mbid}`}
                      className="font-medium text-text transition-colors hover:text-accent"
                    >
                      {artist.name}
                    </Link>
                  )}
                  {year && (
                    <>
                      <span className="text-text-muted">·</span>
                      <span>{year}</span>
                    </>
                  )}
                </div>

                {release.genres.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {release.genres.slice(0, 5).map((genre) => (
                      <span
                        key={genre}
                        className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-text-secondary"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-fit">
                <StarScore
                  overall={scores.overall}
                  overallCount={scores.overallCount}
                  you={scores.you}
                  friends={scores.friends}
                  friendsCount={scores.friendsCount}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-10 sm:px-6">
        <div className="mb-12">
          <RatingForm
            key={mbid}
            kind="album"
            mbid={mbid}
            signedIn={signedIn}
            existing={ownRating}
          />
        </div>

        <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,380px)]">
          <section>
            {/* The first visit to an album fetches its tracklist from
                MusicBrainz, so it streams in rather than holding up the page. */}
            <Suspense fallback={<TracklistPlaceholder />}>
              <Tracklist releaseMbid={mbid} signedIn={signedIn} />
            </Suspense>
          </section>

          <section>
            <SectionHeading>Reviews</SectionHeading>
            {reviews.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No written reviews yet. Be the first.
              </p>
            ) : (
              <ReviewList
                reviews={reviews}
                kind="album"
                signedIn={signedIn}
                reactions={reactions}
              />
            )}
          </section>
        </div>
      </main>
    </>
  );
}

async function Tracklist({
  releaseMbid,
  signedIn,
}: {
  releaseMbid: string;
  signedIn: boolean;
}) {
  const tracks = await getCachedTracks(releaseMbid);
  const scores = await getSongScores(
    tracks.flatMap((t) => (t.song_mbid ? [t.song_mbid] : [])),
  );
  const runtime = totalRuntime(tracks);

  return (
    <>
      <SectionHeading
        action={
          tracks.length > 0 ? (
            <span className="text-xs tabular-nums text-text-muted">
              {tracks.length} songs{runtime ? ` · ${runtime}` : ""}
            </span>
          ) : undefined
        }
      >
        Tracklist
      </SectionHeading>

      {tracks.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No tracklist available for this album.
        </p>
      ) : (
        <SongList
          key={releaseMbid}
          releaseMbid={releaseMbid}
          tracks={tracks}
          community={scores.community}
          initialOwn={scores.own}
          signedIn={signedIn}
        />
      )}
    </>
  );
}

function TracklistPlaceholder() {
  return (
    <>
      <SectionHeading>Tracklist</SectionHeading>
      <div className="space-y-4 rounded-xl border border-border p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonLine
            key={i}
            className={["w-2/3", "w-1/2", "w-3/5", "w-2/5"][i % 4]}
          />
        ))}
      </div>
    </>
  );
}
