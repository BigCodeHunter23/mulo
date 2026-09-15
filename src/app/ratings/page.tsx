import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  getOwnAlbumRatings,
  getOwnArtistRatings,
  getOwnRatingCounts,
  getOwnSongRatings,
  type Sort,
} from "@/lib/ratings";
import type { RatingKind } from "@/lib/rating-kinds";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "My ratings" };

const TABS: { kind: RatingKind; param: string; label: string; empty: string }[] = [
  {
    kind: "album",
    param: "albums",
    label: "Albums",
    empty: "Open any album and tap a score out of 10.",
  },
  {
    kind: "artist",
    param: "artists",
    label: "Artists",
    empty: "Open an artist's page and give them a score out of 10.",
  },
  {
    kind: "song",
    param: "songs",
    label: "Songs",
    empty: "Open an album and tap any song in its tracklist to rate it.",
  },
];

const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "highest", label: "Highest" },
  { key: "lowest", label: "Lowest" },
];

const href = (param: string, sort: Sort) => `/ratings?type=${param}&sort=${sort}`;

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

export default async function MyRatingsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string }>;
}) {
  const { type, sort } = await searchParams;
  const tab = TABS.find((t) => t.param === type) ?? TABS[0];
  const active = SORTS.find((s) => s.key === sort)?.key ?? "recent";

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const counts = await getOwnRatingCounts();
  const total = counts.album + counts.artist + counts.song;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SectionHeading
        action={
          counts[tab.kind] > 1 ? (
            <div className="flex gap-1">
              {SORTS.map((s) => (
                <Link
                  key={s.key}
                  href={href(tab.param, s.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    active === s.key
                      ? "bg-surface-raised text-text"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
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
              href={href(t.param, active)}
              aria-current={current ? "page" : undefined}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
                current ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"
              }`}
            >
              {t.label}
              <span className="text-xs tabular-nums text-text-muted">{counts[t.kind]}</span>
            </Link>
          );
        })}
      </nav>

      {counts[tab.kind] === 0 ? (
        <EmptyState
          title={`No ${tab.label.toLowerCase()} rated yet`}
          body={tab.empty}
          action={<ButtonLink href="/discover">Find something to rate</ButtonLink>}
        />
      ) : tab.kind === "album" ? (
        <AlbumRatings sort={active} />
      ) : tab.kind === "artist" ? (
        <ArtistRatings sort={active} />
      ) : (
        <SongRatings sort={active} />
      )}
    </main>
  );
}

async function AlbumRatings({ sort }: { sort: Sort }) {
  const ratings = await getOwnAlbumRatings(sort);

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

async function ArtistRatings({ sort }: { sort: Sort }) {
  const ratings = await getOwnArtistRatings(sort);

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

async function SongRatings({ sort }: { sort: Sort }) {
  const ratings = await getOwnSongRatings(sort);

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
