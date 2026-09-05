import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCachedArtist,
  getCachedRelease,
  getCachedTracks,
} from "@/lib/catalog";
import { getOwnRating, getReleaseScores } from "@/lib/ratings";
import { getReleaseReviews } from "@/lib/reviews";
import { createClient } from "@/lib/supabase/server";
import StarScore from "@/components/StarScore";
import SectionHeading from "@/components/SectionHeading";
import ReportButton from "@/components/ReportButton";
import RatingForm from "./RatingForm";

function formatDuration(ms: number | null) {
  if (!ms) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function totalRuntime(tracks: { duration_ms: number | null }[]) {
  const ms = tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  if (ms === 0) return null;
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;

  const release = await getCachedRelease(mbid);
  if (!release) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="flex flex-col gap-8 sm:flex-row">
        <div className="w-full shrink-0 sm:w-64">
          <div className="aspect-square overflow-hidden bg-gray-100">
            {release.cover_art_url && (
              /* Plain img: Cover Art Archive redirects to archive.org,
                 so Next's image optimizer adds nothing here. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={release.cover_art_url}
                alt={release.title}
                className="h-full w-full object-cover"
              />
            )}
          </div>

          <dl className="mt-5 space-y-2 text-sm">
            {release.release_date && (
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 font-semibold">Release Date</dt>
                <dd className="text-mulo-muted">{release.release_date}</dd>
              </div>
            )}
            {runtime && (
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 font-semibold">Duration</dt>
                <dd className="text-mulo-muted">{runtime}</dd>
              </div>
            )}
            {release.genres.length > 0 && (
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 font-semibold">Genre</dt>
                <dd className="text-mulo-orange">
                  {release.genres.slice(0, 4).join(", ")}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-display text-4xl font-bold leading-tight text-mulo-navy">
                {release.title}
                {year && (
                  <span className="ml-2 font-normal text-mulo-muted">
                    ({year})
                  </span>
                )}
              </h1>
              {artist && (
                <Link
                  href={`/artist/${artist.mbid}`}
                  className="mt-1 block font-display text-xl text-mulo-orange hover:underline"
                >
                  {artist.name}
                </Link>
              )}
            </div>

            <StarScore
              overall={scores.overall}
              overallCount={scores.overallCount}
              you={scores.you}
              friends={scores.friends}
              friendsCount={scores.friendsCount}
            />
          </div>

          <div className="mt-6">
            <RatingForm
              releaseMbid={mbid}
              signedIn={Boolean(user)}
              existing={ownRating}
            />
          </div>
        </div>
      </div>

      <section className="mt-12">
        <SectionHeading>Tracklist</SectionHeading>
        {tracks.length === 0 ? (
          <p className="text-mulo-muted">No tracklist available.</p>
        ) : (
          <ol className="divide-y divide-gray-200">
            {tracks.map((track) => (
              <li
                key={track.position}
                className="flex items-baseline gap-4 py-2 text-sm"
              >
                <span className="w-7 shrink-0 text-right text-mulo-muted tabular-nums">
                  {track.position}.
                </span>
                <span className="flex-1">{track.title}</span>
                <span className="text-mulo-muted tabular-nums">
                  {formatDuration(track.duration_ms)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-12">
        <SectionHeading>User Reviews</SectionHeading>
        {reviews.length === 0 ? (
          <p className="text-mulo-muted">
            No written reviews yet. Be the first.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-200">
            {reviews.map((review) => (
              <li key={review.id} className="py-4">
                <div className="mb-1 flex items-baseline gap-2">
                  <Link
                    href={`/u/${review.username}`}
                    className="font-display text-lg font-medium hover:underline"
                  >
                    {review.display_name || review.username}
                  </Link>
                  <span className="text-sm text-mulo-muted">
                    @{review.username}
                  </span>
                  <span className="ml-auto font-display text-lg font-semibold tabular-nums text-score-you">
                    {review.score}
                    <span className="text-xs text-mulo-muted">/10</span>
                  </span>
                </div>
                {review.review && (
                  <p className="text-sm text-gray-700">{review.review}</p>
                )}
                <div className="mt-2">
                  <ReportButton
                    ratingId={review.id}
                    signedIn={Boolean(user)}
                    label="Report this review"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
