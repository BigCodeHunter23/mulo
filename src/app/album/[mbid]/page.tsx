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
import RatingForm from "./RatingForm";

function formatDuration(ms: number | null) {
  if (!ms) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-8 flex flex-col gap-6 sm:flex-row">
        <div className="aspect-square w-full shrink-0 overflow-hidden rounded bg-gray-100 sm:w-56">
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

        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold">{release.title}</h1>
            {artist && (
              <Link
                href={`/artist/${artist.mbid}`}
                className="mt-1 block text-lg text-gray-700 hover:underline"
              >
                {artist.name}
              </Link>
            )}
            {release.release_date && (
              <p className="mt-2 text-sm text-gray-500">
                Released {release.release_date}
              </p>
            )}
            {release.genres.length > 0 && (
              <p className="mt-1 text-sm text-gray-500">
                {release.genres.join(", ")}
              </p>
            )}
          </div>

          <StarScore
            community={scores.community}
            communityCount={scores.communityCount}
            you={scores.you}
            following={scores.following}
            followingCount={scores.followingCount}
          />
        </div>
      </header>

      <div className="mb-10">
        <RatingForm
          releaseMbid={mbid}
          signedIn={Boolean(user)}
          existing={ownRating}
        />
      </div>

      {reviews.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-bold">Reviews</h2>
          <ul className="flex flex-col gap-4">
            {reviews.map((review) => (
              <li
                key={review.username}
                className="rounded border border-gray-200 p-4"
              >
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="font-medium">
                    {review.display_name || review.username}
                  </span>
                  <span className="text-sm text-gray-500">
                    @{review.username}
                  </span>
                  <span className="ml-auto font-semibold tabular-nums">
                    {review.score}/10
                  </span>
                </div>
                {review.review && (
                  <p className="text-sm text-gray-700">{review.review}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-3 text-lg font-bold">Tracklist</h2>
      {tracks.length === 0 ? (
        <p className="text-gray-600">No tracklist available.</p>
      ) : (
        <ol className="divide-y divide-gray-200">
          {tracks.map((track) => (
            <li
              key={track.position}
              className="flex items-baseline gap-3 py-2 text-sm"
            >
              <span className="w-6 shrink-0 text-right text-gray-400">
                {track.position}
              </span>
              <span className="flex-1">{track.title}</span>
              <span className="text-gray-500">
                {formatDuration(track.duration_ms)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
