import { Suspense } from "react";
import { mostPlayedAlbums, popularArtists, topRatedOnMulo } from "@/lib/discover";
import { getGlobalFeed } from "@/lib/feed";
import { getHeavyRotation } from "@/lib/trending";
import { getCurrentUser } from "@/lib/supabase/server";
import HeavyRotation from "@/components/HeavyRotation";
import TodaysVersus, { TodaysVersusPlaceholder } from "@/components/TodaysVersus";
import AlbumCard from "@/components/AlbumCard";
import ArtistCard from "@/components/ArtistCard";
import FeedItem from "@/components/FeedItem";
import { SkeletonLine, SkeletonRows } from "@/components/Skeleton";
import { SectionHeading } from "@/components/ui";

// On phones each section is a row to swipe through, with the next card peeking
// in; from tablet width up it's a grid.
const ALBUM_GRID =
  "rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5";
const ALBUM_ITEM = "w-[42%] shrink-0 sm:w-auto";
const ARTIST_GRID =
  "rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:gap-x-4 sm:gap-y-7 sm:overflow-visible sm:px-0 sm:pb-0";
const ARTIST_ITEM = "w-[29%] shrink-0 sm:w-auto";

/**
 * The browsable parts of MULO, shared by the Discover page and the home page.
 * Each section streams in on its own, so a slow one never holds up the rest.
 * The two that only appear once there's enough activity show nothing while
 * they load, rather than a placeholder that might vanish.
 */
export default function DiscoverSections() {
  return (
    <div className="flex flex-col gap-14">
      <Suspense fallback={<TodaysVersusPlaceholder />}>
        <TodaysVersus />
      </Suspense>
      <Suspense fallback={null}>
        <Rotation />
      </Suspense>
      <Suspense fallback={null}>
        <TopRated />
      </Suspense>
      <Suspense fallback={<GridPlaceholder title="Most-played albums" />}>
        <MostPlayed />
      </Suspense>
      <Suspense fallback={<GridPlaceholder title="Artists to explore" round />}>
        <ArtistsToExplore />
      </Suspense>
      <Suspense
        fallback={
          <section>
            <SectionHeading>Just rated</SectionHeading>
            <SkeletonRows count={2} />
          </section>
        }
      >
        <JustRated />
      </Suspense>
    </div>
  );
}

function GridPlaceholder({ title, round = false }: { title: string; round?: boolean }) {
  return (
    <section>
      <SectionHeading>{title}</SectionHeading>
      <div className={round ? ARTIST_GRID : ALBUM_GRID}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={round ? ARTIST_ITEM : ALBUM_ITEM}>
            <div
              className={`aspect-square animate-pulse bg-surface-raised ${
                round ? "rounded-full" : "rounded-lg"
              }`}
            />
            <SkeletonLine className="mx-auto mt-2.5 w-3/4" />
          </div>
        ))}
      </div>
    </section>
  );
}

async function Rotation() {
  const rotation = await getHeavyRotation(10);
  return rotation ? <HeavyRotation rotation={rotation} /> : null;
}

async function TopRated() {
  const topRated = await topRatedOnMulo(10);
  // Only worth showing once enough albums have been rated to rank.
  if (topRated.length < 4) return null;

  return (
    <section>
      <SectionHeading>Top rated on MULO</SectionHeading>
      <ul className={ALBUM_GRID}>
        {topRated.map((album, i) => (
          <li key={album.mbid} className={ALBUM_ITEM}>
            <AlbumCard
              mbid={album.mbid}
              title={album.title}
              artist={album.artist}
              coverUrl={album.cover_art_url}
              score={album.average}
              eager={i < 5}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function MostPlayed() {
  const mostPlayed = await mostPlayedAlbums(15);
  if (mostPlayed.length === 0) return null;

  return (
    <section>
      <SectionHeading
        action={<span className="text-xs text-text-muted">By listens on ListenBrainz</span>}
      >
        Most-played albums
      </SectionHeading>
      <ul className={ALBUM_GRID}>
        {mostPlayed.map((album, i) => (
          <li key={album.mbid} className={ALBUM_ITEM}>
            <AlbumCard
              mbid={album.mbid}
              title={album.title}
              artist={album.artist}
              year={album.year}
              coverUrl={album.cover_art_url}
              eager={i < 5}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ArtistsToExplore() {
  const artists = await popularArtists(10);
  if (artists.length === 0) return null;

  return (
    <section>
      <SectionHeading>Artists to explore</SectionHeading>
      <ul className={ARTIST_GRID}>
        {artists.map((artist) => (
          <li key={artist.mbid} className={ARTIST_ITEM}>
            <ArtistCard mbid={artist.mbid} name={artist.name} imageUrl={artist.image_url} />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function JustRated() {
  const [recent, user] = await Promise.all([getGlobalFeed(6), getCurrentUser()]);
  if (recent.length === 0) return null;

  return (
    <section>
      <SectionHeading>Just rated</SectionHeading>
      <ul className="grid gap-3 md:grid-cols-2">
        {recent.map((item) => (
          <FeedItem key={item.key} item={item} signedIn={Boolean(user)} />
        ))}
      </ul>
    </section>
  );
}
