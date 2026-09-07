import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCachedArtist,
  getCachedRelease,
  getCachedTracks,
} from "@/lib/catalog";
import { getOwnRating, getReleaseScores } from "@/lib/ratings";
import { getReleaseReviews } from "@/lib/reviews";
import { getCurrentUser } from "@/lib/supabase/server";
import StarScore from "@/components/StarScore";
import Avatar from "@/components/Avatar";
import ReportButton from "@/components/ReportButton";
import { SectionHeading } from "@/components/ui";
import RatingForm from "./RatingForm";

function formatDuration(ms: number | null) {
  if (!ms) return "";
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
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

  const [artist, tracks, scores, ownRating, reviews] = await Promise.all([
    release.artist_mbid ? getCachedArtist(release.artist_mbid) : null,
    getCachedTracks(mbid),
    getReleaseScores(mbid),
    getOwnRating(mbid),
    getReleaseReviews(mbid),
  ]);

  const runtime = totalRuntime(tracks);
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
                  {runtime && (
                    <>
                      <span className="text-text-muted">·</span>
                      <span>{runtime}</span>
                    </>
                  )}
                  {tracks.length > 0 && (
                    <>
                      <span className="text-text-muted">·</span>
                      <span>{tracks.length} tracks</span>
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
            releaseMbid={mbid}
            signedIn={Boolean(user)}
            existing={ownRating}
          />
        </div>

        <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,380px)]">
          <section>
            <SectionHeading>Tracklist</SectionHeading>
            {tracks.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No tracklist available for this release.
              </p>
            ) : (
              <ol className="overflow-hidden rounded-xl border border-border">
                {tracks.map((track, i) => (
                  <li
                    key={track.position}
                    className={`flex items-center gap-4 px-4 py-2.5 text-sm transition-colors hover:bg-surface ${
                      i % 2 ? "bg-surface/40" : ""
                    }`}
                  >
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-text-muted">
                      {track.position}
                    </span>
                    <span className="flex-1 truncate text-text">
                      {track.title}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-text-muted">
                      {formatDuration(track.duration_ms)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <SectionHeading>Reviews</SectionHeading>
            {reviews.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No written reviews yet. Be the first.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {reviews.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-xl border border-border bg-surface p-4"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        url={review.avatar_url}
                        name={review.display_name || review.username}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/u/${review.username}`}
                          className="block truncate text-sm font-medium text-text transition-colors hover:text-accent"
                        >
                          {review.display_name || review.username}
                        </Link>
                        <span className="text-xs text-text-muted">
                          @{review.username}
                        </span>
                      </div>
                      <span className="display-sm shrink-0 tabular-nums text-score-you">
                        {review.score}
                        <span className="text-xs text-text-muted">/10</span>
                      </span>
                    </div>

                    {review.review && (
                      <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                        {review.review}
                      </p>
                    )}

                    <div className="mt-3">
                      <ReportButton
                        ratingId={review.id}
                        signedIn={Boolean(user)}
                        label="Report"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
