import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCachedArtist, getCachedArtistAlbums } from "@/lib/catalog";
import {
  getOwnRating,
  getScores,
  getScoresForReleases,
  getTopSongs,
} from "@/lib/ratings";
import { getReviews } from "@/lib/reviews";
import { getReactions } from "@/lib/reactions";
import { getCurrentUser } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import AlbumCard from "@/components/AlbumCard";
import RatingForm from "@/components/RatingForm";
import ReviewList from "@/components/ReviewList";
import StarScore from "@/components/StarScore";
import ReadMore from "@/components/ReadMore";
import TopSongs from "@/components/TopSongs";
import WhereNext from "@/components/WhereNext";
import { SectionHeading } from "@/components/ui";
import FinishTheSet from "@/components/FinishTheSet";
import { getSetProgress } from "@/lib/gauntlet";
import { getUsername } from "@/lib/social";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mbid: string }>;
}): Promise<Metadata> {
  const { mbid } = await params;
  const { data } = await createPublicClient()
    .from("artists")
    .select("name, bio")
    .eq("mbid", mbid)
    .maybeSingle();

  if (!data) return { title: "Artist" };

  const name = String(data.name);
  const bio = (data.bio as string | null) ?? "";
  const description = bio
    ? bio.length > 160
      ? `${bio.slice(0, 157).trimEnd()}…`
      : bio
    : `${name}, their albums and songs, rated and reviewed on MULO.`;

  return {
    title: name,
    description,
    openGraph: { type: "website", siteName: "MULO", title: name, description },
  };
}

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;

  const artist = await getCachedArtist(mbid);
  if (!artist) notFound();

  const user = await getCurrentUser();
  const signedIn = Boolean(user);

  const [albums, scores, ownRating, reviews, topSongs] = await Promise.all([
    getCachedArtistAlbums(mbid),
    getScores("artist", mbid),
    getOwnRating("artist", mbid),
    getReviews("artist", mbid),
    getTopSongs(mbid),
  ]);
  const [albumScores, reactions] = await Promise.all([
    getScoresForReleases(albums.map((a) => a.mbid)),
    getReactions(
      "artist",
      reviews.map((review) => review.id),
    ),
  ]);

  // How much of the discography the signed-in person has rated, and where
  // their ranking lives once it's done.
  const [setProgress, me] = user
    ? await Promise.all([
        getSetProgress(
          user.id,
          albums.map((a) => a.mbid),
        ),
        getUsername(user.id),
      ])
    : [null, null];

  // A "top songs" list isn't worth a section until a few songs have scores.
  const showTopSongs = topSongs.length >= 3;

  return (
    <>
      <div className="relative">
        <div className="backdrop h-[360px]">
          {artist.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.image_url} alt="" aria-hidden="true" />
          )}
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-end sm:gap-9 sm:text-left">
            {artist.image_url && (
              <div className="artwork h-48 w-48 shrink-0 overflow-hidden rounded-full sm:h-48 sm:w-48">
                {/* Wikimedia Commons photo, served from their CDN. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={artist.image_url}
                  alt={artist.name}
                  fetchPriority="high"
                  className="h-full w-full object-cover object-top"
                />
              </div>
            )}

            <div className="flex w-full min-w-0 flex-col items-center pb-2 sm:w-auto sm:items-start">
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                Artist
              </p>
              <h1 className="display mt-2 text-balance text-4xl text-text sm:text-6xl">
                {artist.name}
              </h1>
              {albums.length > 0 && (
                <p className="mt-3 text-sm text-text-secondary">
                  {albums.length} album{albums.length === 1 ? "" : "s"}
                </p>
              )}
              <div className="mt-5 w-full sm:w-fit">
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

          {artist.bio && <ReadMore text={artist.bio} className="mt-7 max-w-3xl" />}
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-10 sm:px-6">
        <div className="mb-12">
          <RatingForm
            key={mbid}
            kind="artist"
            mbid={mbid}
            signedIn={signedIn}
            existing={ownRating}
          />
        </div>

        {(showTopSongs || reviews.length > 0) && (
          <div className="mb-14 grid gap-12 lg:grid-cols-2">
            {showTopSongs && (
              <section>
                <SectionHeading>Top songs on MULO</SectionHeading>
                <TopSongs songs={topSongs} />
              </section>
            )}
            {reviews.length > 0 && (
              <section>
                <SectionHeading>Reviews</SectionHeading>
                <ReviewList
                  reviews={reviews}
                  kind="artist"
                  signedIn={signedIn}
                  reactions={reactions}
                />
              </section>
            )}
          </div>
        )}

        {setProgress && (
          <FinishTheSet
            artistMbid={mbid}
            artistName={artist.name}
            progress={setProgress}
            rankingHref={me ? `/u/${me}/ranks/${mbid}` : null}
          />
        )}

        <SectionHeading>Albums</SectionHeading>

        {albums.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No albums found for this artist.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-5">
            {albums.map((album, i) => (
              <li key={album.mbid}>
                <AlbumCard
                  mbid={album.mbid}
                  title={album.title}
                  year={album.release_date?.slice(0, 4) ?? null}
                  coverUrl={album.cover_art_url}
                  score={albumScores.get(album.mbid) ?? null}
                  eager={i < 5}
                />
              </li>
            ))}
          </ul>
        )}

        {/* The end of the page shouldn't be a dead end. */}
        <Suspense fallback={null}>
          <WhereNext mbid={mbid} name={artist.name} />
        </Suspense>
      </main>
    </>
  );
}
