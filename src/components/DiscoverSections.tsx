import Link from "next/link";
import { Suspense } from "react";
import {
  artistsToExplore,
  mostPlayedAlbums,
  newReleases,
  topRatedOnMulo,
} from "@/lib/discover";
import { getGlobalFeed } from "@/lib/feed";
import { getHeavyRotation } from "@/lib/trending";
import { getCurrentUser } from "@/lib/supabase/server";
import { getMyAlbumScores } from "@/lib/ratings";
import HeavyRotation from "@/components/HeavyRotation";
import TodaysVersus, { TodaysVersusPlaceholder } from "@/components/TodaysVersus";
import DropBanner from "@/components/DropBanner";
import GuessBanner from "@/components/GuessBanner";
import AlbumCard from "@/components/AlbumCard";
import ArtistCard from "@/components/ArtistCard";
import FeedItem from "@/components/FeedItem";
import ListCard from "@/components/ListCard";
import HoldTip from "@/components/HoldTip";
import DiscoverSearch from "@/components/DiscoverSearch";
import { getRecentLists } from "@/lib/lists";
import { SkeletonLine, SkeletonRows } from "@/components/Skeleton";
import {
  ALBUM_GRID,
  ALBUM_ITEM,
  ARTIST_GRID,
  ARTIST_ITEM,
  SectionHeading,
} from "@/components/ui";

/**
 * The browsable parts of MULO, shared by the Discover page and the home page.
 * Each section streams in on its own, so a slow one never holds up the rest.
 * The two that only appear once there's enough activity show nothing while
 * they load, rather than a placeholder that might vanish.
 */
export default function DiscoverSections({ search = false }: { search?: boolean }) {
  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col gap-3">
        {/* First thing on the page. Anybody who came to look one record up is
            here for this, and below the week's banners it read as a footnote
            to them rather than the way in. */}
        {search && <DiscoverSearch />}
        <Suspense fallback={null}>
          <DropBanner />
        </Suspense>
        <GuessBanner />
        <HoldTip />
        <Shortcuts />
      </div>
      <Suspense fallback={<TodaysVersusPlaceholder />}>
        <TodaysVersus />
      </Suspense>
      <Suspense fallback={null}>
        <Rotation />
      </Suspense>
      <Suspense fallback={<GridPlaceholder title="New releases" />}>
        <NewReleases />
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
      <Suspense fallback={null}>
        <RecentLists />
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

export async function NewReleases() {
  const fresh = await newReleases(10);
  if (fresh.length < 4) return null;
  const mine = await getMyAlbumScores(fresh.map((album) => album.mbid));

  return (
    <section>
      <SectionHeading
        action={<span className="text-xs text-text-muted">Out in the last few months</span>}
      >
        New releases
      </SectionHeading>
      <ul className={ALBUM_GRID}>
        {fresh.map((album, i) => (
          <li key={album.mbid} className={ALBUM_ITEM}>
            <AlbumCard
              mbid={album.mbid}
              title={album.title}
              artist={album.artist}
              year={album.year}
              coverUrl={album.cover_art_url}
              mine={mine.get(album.mbid)}
              eager={i < 5}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The places the header carries on a wide screen but the phone's tab bar has
 * no room for. Phones only: on anything wider these already sit in the header.
 */
function Shortcuts() {
  const links = [
    { href: "/search", label: "Search" },
    { href: "/charts", label: "The Charts" },
    { href: "/lists", label: "Lists" },
    { href: "/goat", label: "Your GOAT" },
    { href: "/ratings", label: "My Ratings" },
    { href: "/guess", label: "Guess the score" },
  ];

  return (
    <nav aria-label="More on MULO" className="-mx-4 overflow-x-auto px-4 sm:hidden">
      <ul className="flex w-max gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-text-secondary transition-colors active:border-accent active:text-accent"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

async function TopRated() {
  const topRated = await topRatedOnMulo(10);
  // Only worth showing once enough albums have been rated to rank.
  if (topRated.length < 4) return null;
  const mine = await getMyAlbumScores(topRated.map((album) => album.mbid));

  return (
    <section>
      <SectionHeading
        action={
          <Link
            href="/charts"
            className="text-xs font-medium text-text-secondary transition-colors hover:text-accent"
          >
            The Charts →
          </Link>
        }
      >
        Top rated on MULO
      </SectionHeading>
      <ul className={ALBUM_GRID}>
        {topRated.map((album, i) => (
          <li key={album.mbid} className={ALBUM_ITEM}>
            <AlbumCard
              mbid={album.mbid}
              title={album.title}
              artist={album.artist}
              coverUrl={album.cover_art_url}
              score={album.average}
              mine={mine.get(album.mbid)}
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
  const mine = await getMyAlbumScores(mostPlayed.map((album) => album.mbid));

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
              mine={mine.get(album.mbid)}
              eager={i < 5}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ArtistsToExplore() {
  const artists = await artistsToExplore(15);
  if (artists.length === 0) return null;

  return (
    <section>
      <SectionHeading
        action={<span className="text-xs text-text-muted">New picks every hour</span>}
      >
        Artists to explore
      </SectionHeading>
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

/** People's lists, newest first. Only shows once somebody has made one. */
async function RecentLists() {
  const lists = await getRecentLists(4).catch(() => []);
  if (lists.length === 0) return null;

  return (
    <section>
      <SectionHeading
        action={
          <Link href="/lists" className="text-xs text-text-muted transition-colors hover:text-text">
            All lists →
          </Link>
        }
      >
        Lists
      </SectionHeading>
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
