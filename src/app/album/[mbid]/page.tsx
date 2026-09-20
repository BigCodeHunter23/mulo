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
import { promptFor } from "@/lib/review-prompts";
import { getCurrentUser } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import StarScore from "@/components/StarScore";
import WhereNext from "@/components/WhereNext";
import RatingForm from "@/components/RatingForm";
import ListenOn from "@/components/ListenOn";
import AddToList from "@/components/AddToList";
import TrackView from "@/components/TrackView";
import ListCard from "@/components/ListCard";
import { getListsWithAlbum, getMyListsFor } from "@/lib/lists";
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

  const [artist, scores, ownRating, reviews, myLists] = await Promise.all([
    release.artist_mbid ? getCachedArtist(release.artist_mbid) : null,
    getScores("album", mbid),
    getOwnRating("album", mbid),
    getReviews("album", mbid),
    user ? getMyListsFor(user.id, mbid).catch(() => []) : Promise.resolve([]),
  ]);

  const reactions = await getReactions(
    "album",
    reviews.map((review) => review.id),
  );
  const year = release.release_date?.slice(0, 4);

  return (
    <>
      <TrackView
        kind="album"
        mbid={mbid}
        title={release.title}
        subtitle={artist?.name ?? null}
        image={release.cover_art_url}
      />
      {/* The artwork, blurred and blown up, bleeding out behind the header. */}
      <div className="relative">
        <div className="backdrop h-[420px]">
          {release.cover_art_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={release.cover_art_url} alt="" aria-hidden="true" />
          )}
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-end sm:gap-9 sm:text-left">
            <div className="artwork aspect-square w-[64%] max-w-72 shrink-0 overflow-hidden rounded-xl sm:w-60">
              {release.cover_art_url && (
                /* Cover Art Archive redirects to archive.org, so Next's
                   image optimizer adds nothing here. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={release.cover_art_url}
                  alt={release.title}
                  fetchPriority="high"
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="flex w-full min-w-0 flex-col items-center gap-5 pb-2 sm:w-auto sm:items-start">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                  Album
                </p>
                <h1 className="display mt-2 text-balance text-4xl text-text sm:text-5xl">
                  {release.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-text-secondary sm:justify-start">
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
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5 sm:justify-start">
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

                <ListenOn
                  artist={artist?.name ?? null}
                  title={release.title}
                  className="mt-4"
                />
                <div className="mt-3 flex justify-center sm:justify-start">
                  <AddToList releaseMbid={mbid} signedIn={signedIn} lists={myLists} />
                </div>
              </div>

              <div className="w-full sm:w-fit">
                <StarScore
                  overall={scores.overall}
                  overallCount={scores.overallCount}
                  you={scores.you}
                  friends={scores.friends}
                  friendsCount={scores.friendsCount}
                  seeded={scores.seeded}
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
              <Tracklist
                releaseMbid={mbid}
                artist={artist?.name ?? null}
                albumTitle={release.title}
                signedIn={signedIn}
              />
            </Suspense>
          </section>

          <section>
            <SectionHeading>Reviews</SectionHeading>
            {reviews.length === 0 ? (
              // An invitation rather than a verdict: "no reviews yet" teaches
              // people that nobody writes here, where the question gets answers.
              <p className="text-sm text-text-secondary">
                Nobody has said anything about this one yet.{" "}
                <span className="text-text">{promptFor("album", mbid)}</span>
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

        <Suspense fallback={null}>
          <OnLists releaseMbid={mbid} />
        </Suspense>

        {/* The end of the page shouldn't be a dead end. */}
        {artist && (
          <Suspense fallback={null}>
            <WhereNext mbid={artist.mbid} name={artist.name} />
          </Suspense>
        )}
      </main>
    </>
  );
}

async function Tracklist({
  releaseMbid,
  artist,
  albumTitle,
  signedIn,
}: {
  releaseMbid: string;
  artist: string | null;
  albumTitle: string;
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
          artist={artist}
          albumTitle={albumTitle}
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

/** Lists this album is on, so one good list leads to the next. */
async function OnLists({ releaseMbid }: { releaseMbid: string }) {
  const lists = (await getListsWithAlbum(releaseMbid).catch(() => [])).filter((list) => list.count > 0);
  if (lists.length === 0) return null;

  return (
    <section className="mt-12">
      <SectionHeading>On these lists</SectionHeading>
      <ul className="grid gap-2 sm:grid-cols-2">
        {lists.map((list) => (
          <li key={list.id}>
            <ListCard list={list} />
          </li>
        ))}
      </ul>
    </section>
  );
}
