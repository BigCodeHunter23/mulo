import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  getOwnAlbumRatings,
  getOwnArtistRatings,
  getOwnRatingCounts,
  getOwnSongRatings,
  type AlbumRating,
  type ArtistRating,
  type SongRating,
} from "@/lib/ratings";
import type { RatingKind } from "@/lib/rating-kinds";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";
import { GENRE_FAMILIES, familiesFor } from "@/lib/badge-catalog";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "My ratings" };

const TABS: {
  kind: RatingKind;
  param: string;
  label: string;
  noun: string;
  empty: string;
}[] = [
  {
    kind: "album",
    param: "albums",
    label: "Albums",
    noun: "albums",
    empty: "Open any album and tap a score out of 10.",
  },
  {
    kind: "artist",
    param: "artists",
    label: "Artists",
    noun: "artists",
    empty: "Open an artist's page and give them a score out of 10.",
  },
  {
    kind: "song",
    param: "songs",
    label: "Songs",
    noun: "songs",
    empty: "Open an album and tap any song in its tracklist to rate it.",
  },
];

const CHIP =
  "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors";
const CHIP_ON = "border-accent bg-accent-subtle text-accent";
const CHIP_OFF =
  "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text";

/** How many of a score to show before the band gets a "see all" link. */
const PER_BAND = 8;

const CARD =
  "group flex gap-4 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong";

function YourScore({ score }: { score: number }) {
  return (
    <span className="display-sm shrink-0 tabular-nums text-score-you">
      {score}
      <span className="text-[10px] text-text-muted">/10</span>
    </span>
  );
}

/** Ratings grouped by score, best first: the 10s, then the 9s, and so on. */
function byScore<T extends { score: number }>(items: T[]): [number, T[]][] {
  const bands = new Map<number, T[]>();
  for (const item of items) {
    bands.set(item.score, [...(bands.get(item.score) ?? []), item]);
  }
  return [...bands.entries()].sort((a, b) => b[0] - a[0]);
}

export default async function MyRatingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    view?: string;
    score?: string;
    decade?: string;
    genre?: string;
  }>;
}) {
  const { type, view, score, decade: decadeParam, genre: genreParam } = await searchParams;
  const tab = TABS.find((t) => t.param === type) ?? TABS[0];
  const recent = view === "recent";
  const band = Number(score);
  const openBand = Number.isInteger(band) && band >= 1 && band <= 10 ? band : null;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const counts = await getOwnRatingCounts();
  const total = counts.album + counts.artist + counts.song;

  // Grouping by score reads best highest-first; "recent" keeps its own order.
  const sort = recent ? "recent" : "highest";
  const [albums, artists, songs] = await Promise.all([
    tab.kind === "album" ? getOwnAlbumRatings(sort) : [],
    tab.kind === "artist" ? getOwnArtistRatings(sort) : [],
    tab.kind === "song" ? getOwnSongRatings(sort) : [],
  ]);

  // Album filters: a decade ("1990") and a genre family ("hip-hop"). They
  // only mean anything for albums, which carry a date and genre tags.
  const decade = tab.kind === "album" && /^\d{4}$/.test(decadeParam ?? "") ? Number(decadeParam) : null;
  const genre =
    tab.kind === "album" && GENRE_FAMILIES.some((f) => f.id === genreParam) ? genreParam! : null;

  const href = (
    param: string,
    options: {
      view?: string;
      score?: number;
      decade?: number | null;
      genre?: string | null;
    } = {},
  ) => {
    const search = new URLSearchParams({ type: param });
    if (options.view) search.set("view", options.view);
    if (options.score) search.set("score", String(options.score));
    // Filters carry across views and bands unless explicitly changed.
    const d = options.decade === undefined ? decade : options.decade;
    const g = options.genre === undefined ? genre : options.genre;
    if (param === "albums" && d) search.set("decade", String(d));
    if (param === "albums" && g) search.set("genre", g);
    return `/ratings?${search}`;
  };

  function items(list: (AlbumRating | ArtistRating | SongRating)[]) {
    if (tab.kind === "album") return <AlbumItems ratings={list as AlbumRating[]} />;
    if (tab.kind === "artist") return <ArtistItems ratings={list as ArtistRating[]} />;
    return <SongItems ratings={list as SongRating[]} />;
  }

  const decadeOf = (rating: AlbumRating) => {
    const year = Number(rating.release.release_date?.slice(0, 4));
    return Number.isFinite(year) && year > 1900 ? Math.floor(year / 10) * 10 : null;
  };

  // Only the decades and genres somebody actually has, so no chip leads nowhere.
  const decades = [...new Set(albums.map(decadeOf).filter((d): d is number => d !== null))].sort();
  const genresHeld = GENRE_FAMILIES.filter((family) =>
    albums.some((rating) => familiesFor(rating.release.genres ?? []).includes(family.id)),
  );

  const filteredAlbums = albums.filter(
    (rating) =>
      (decade === null || decadeOf(rating) === decade) &&
      (genre === null || familiesFor(rating.release.genres ?? []).includes(genre)),
  );

  const all: (AlbumRating | ArtistRating | SongRating)[] =
    tab.kind === "album" ? filteredAlbums : tab.kind === "artist" ? artists : songs;
  const shown = openBand ? all.filter((r) => r.score === openBand) : all;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SectionHeading
        action={
          counts[tab.kind] > 1 ? (
            <div className="flex gap-1">
              <Link
                href={href(tab.param)}
                className={`rounded-md px-3 py-2 text-xs font-medium transition-colors sm:px-2.5 sm:py-1 ${
                  !recent ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"
                }`}
              >
                By score
              </Link>
              <Link
                href={href(tab.param, { view: "recent" })}
                className={`rounded-md px-3 py-2 text-xs font-medium transition-colors sm:px-2.5 sm:py-1 ${
                  recent ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"
                }`}
              >
                Recent
              </Link>
            </div>
          ) : undefined
        }
      >
        My ratings
        {total > 0 && (
          <span className="ml-2 text-sm font-normal text-text-muted">{total}</span>
        )}
      </SectionHeading>

      <nav
        aria-label="Kinds of rating"
        className="mb-6 flex gap-1 rounded-lg border border-border bg-surface p-1 sm:w-fit"
      >
        {TABS.map((t) => {
          const current = t.kind === tab.kind;
          return (
            <Link
              key={t.param}
              href={href(t.param, { view: recent ? "recent" : undefined })}
              aria-current={current ? "page" : undefined}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:py-1.5 ${
                current ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"
              }`}
            >
              {t.label}
              <span className="text-xs tabular-nums text-text-muted">
                {counts[t.kind]}
              </span>
            </Link>
          );
        })}
      </nav>

      {tab.kind === "album" && albums.length > 1 && (decades.length > 1 || genresHeld.length > 1) && (
        <div className="mb-8 flex flex-col gap-2.5">
          {decades.length > 1 && (
            <nav aria-label="Decade" className="rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {[null, ...decades].map((d) => (
                <Link
                  key={d ?? "all"}
                  href={href("albums", { view: recent ? "recent" : undefined, decade: d })}
                  aria-current={decade === d ? "page" : undefined}
                  className={`${CHIP} ${decade === d ? CHIP_ON : CHIP_OFF}`}
                >
                  {d === null ? "All decades" : `${String(d).slice(2)}s`}
                </Link>
              ))}
            </nav>
          )}
          {genresHeld.length > 1 && (
            <nav aria-label="Genre" className="rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {[null, ...genresHeld].map((family) => (
                <Link
                  key={family?.id ?? "all"}
                  href={href("albums", { view: recent ? "recent" : undefined, genre: family?.id ?? null })}
                  aria-current={genre === (family?.id ?? null) ? "page" : undefined}
                  className={`${CHIP} ${genre === (family?.id ?? null) ? CHIP_ON : CHIP_OFF}`}
                >
                  {family?.name ?? "All genres"}
                </Link>
              ))}
            </nav>
          )}
          {(decade !== null || genre !== null) && (
            <p className="text-xs text-text-muted">
              {filteredAlbums.length} of {albums.length} albums
            </p>
          )}
        </div>
      )}

      {counts[tab.kind] === 0 ? (
        <EmptyState
          title={`No ${tab.noun} rated yet`}
          body={tab.empty}
          action={<ButtonLink href="/discover">Find something to rate</ButtonLink>}
        />
      ) : openBand ? (
        <>
          <div className="mb-5 flex items-baseline gap-3">
            <span className="display text-3xl tabular-nums text-score-you">
              {openBand}
            </span>
            <span className="text-sm text-text-muted">
              {shown.length} {tab.noun}
            </span>
            <Link
              href={href(tab.param)}
              className="ml-auto text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
            >
              ← All scores
            </Link>
          </div>
          {items(shown)}
        </>
      ) : recent ? (
        items(all)
      ) : (
        <div className="flex flex-col gap-10">
          {byScore(all).map(([score, list]) => (
            <section key={score}>
              <div className="mb-4 flex items-baseline gap-3">
                <span className="display text-2xl tabular-nums text-score-you">
                  {score}
                </span>
                <span className="text-sm text-text-muted">
                  {list.length} {tab.noun}
                </span>
                {list.length > PER_BAND && (
                  <Link
                    href={href(tab.param, { score })}
                    className="ml-auto text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
                  >
                    See all {list.length} →
                  </Link>
                )}
              </div>
              {items(list.slice(0, PER_BAND))}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function AlbumItems({ ratings }: { ratings: AlbumRating[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {ratings.map((rating) => {
        const cover = coverSrc(rating.release.cover_art_url, 250);

        return (
          <li key={rating.release.mbid} className={CARD}>
            <Link
              href={`/album/${rating.release.mbid}`}
              className="artwork h-20 w-20 shrink-0 overflow-hidden rounded-lg transition-transform group-hover:scale-[1.02]"
            >
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt={rating.release.title}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </Link>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                <Link
                  href={`/album/${rating.release.mbid}`}
                  className="display-sm min-w-0 flex-1 truncate text-sm text-text transition-colors hover:text-accent"
                >
                  {rating.release.title}
                </Link>
                <YourScore score={rating.score} />
              </div>

              {rating.release.artist && (
                <Link
                  href={`/artist/${rating.release.artist.mbid}`}
                  className="block truncate text-sm text-text-secondary transition-colors hover:text-text"
                >
                  {rating.release.artist.name}
                </Link>
              )}

              {rating.review && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-text-muted">
                  {rating.review}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ArtistItems({ ratings }: { ratings: ArtistRating[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {ratings.map((rating) => {
        const photo = artistPhotoSrc(rating.artist.image_url, 300);

        return (
          <li key={rating.artist.mbid} className={CARD}>
            <Link
              href={`/artist/${rating.artist.mbid}`}
              className="artwork h-20 w-20 shrink-0 overflow-hidden rounded-full transition-transform group-hover:scale-[1.02]"
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt={rating.artist.name}
                  loading="lazy"
                  className="h-full w-full object-cover object-top"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-text-muted">
                  {rating.artist.name.charAt(0).toUpperCase()}
                </span>
              )}
            </Link>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                <Link
                  href={`/artist/${rating.artist.mbid}`}
                  className="display-sm min-w-0 flex-1 truncate text-sm text-text transition-colors hover:text-accent"
                >
                  {rating.artist.name}
                </Link>
                <YourScore score={rating.score} />
              </div>

              {rating.review && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-text-muted">
                  {rating.review}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SongItems({ ratings }: { ratings: SongRating[] }) {
  return (
    <ol className="overflow-hidden rounded-xl border border-border">
      {ratings.map((rating, i) => {
        const cover = coverSrc(rating.release.cover_art_url, 250);

        return (
          <li key={rating.song.mbid} className={i % 2 ? "bg-surface/40" : ""}>
            <Link
              href={`/album/${rating.release.mbid}`}
              className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-hover"
            >
              <span className="artwork h-11 w-11 shrink-0 overflow-hidden rounded-md">
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text">
                  {rating.song.title}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {rating.release.title}
                  {rating.release.artist && ` · ${rating.release.artist.name}`}
                </span>
              </span>
              <YourScore score={rating.score} />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
