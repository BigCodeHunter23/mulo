"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { rate, removeRating } from "@/app/ratings/actions";
import { useBadgeUnlock } from "@/components/BadgeUnlock";
import { PlayButton, PreviewCredit } from "@/components/PreviewPlayer";
import { Star } from "@/components/StarScore";

type Song = {
  position: number;
  title: string;
  duration_ms: number | null;
  song_mbid: string | null;
};

function formatDuration(ms: number | null) {
  if (!ms) return "";
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/**
 * The tracklist, where every song can be rated: tap a song to open its
 * scores, tap a score to save it. Scores only, no reviews, so going through
 * a whole album takes a minute. Changes show at once and roll back if the
 * save fails.
 */
export default function SongList({
  releaseMbid,
  artist,
  tracks,
  community,
  initialOwn,
  signedIn,
}: {
  releaseMbid: string;
  /** For finding each song's preview; without it there are no play buttons. */
  artist: string | null;
  tracks: Song[];
  community: Record<string, { average: number; count: number }>;
  initialOwn: Record<string, number>;
  signedIn: boolean;
}) {
  const [own, setOwn] = useState(initialOwn);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; needsProfile?: boolean } | null>(
    null,
  );
  const [, startTransition] = useTransition();
  const { celebrate, overlay } = useBadgeUnlock();

  /** A score to save, or null to remove this person's score. */
  function save(songMbid: string, value: number | null) {
    const previous = own[songMbid];
    const put = (next: number | undefined) =>
      setOwn((current) => {
        const copy = { ...current };
        if (next === undefined) delete copy[songMbid];
        else copy[songMbid] = next;
        return copy;
      });

    put(value ?? undefined);
    setOpen(null);
    setError(null);

    startTransition(async () => {
      const result =
        value === null
          ? await removeRating("song", songMbid, releaseMbid)
          : await rate("song", songMbid, value, releaseMbid);
      if (result.ok) {
        celebrate(result);
        return;
      }

      put(previous);
      setError({ text: result.error, needsProfile: result.needsProfile });
    });
  }

  // Tracklists saved before songs existed can't be rated until refreshed.
  const hasSongs = tracks.some((t) => t.song_mbid);

  return (
    <div>
      {hasSongs && !signedIn && (
        <p className="-mt-2 mb-4 text-xs text-text-muted">
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Log in
          </Link>{" "}
          to rate songs.
        </p>
      )}
      {hasSongs && signedIn && Object.keys(own).length === 0 && (
        <p className="-mt-2 mb-4 text-xs text-text-muted">Tap a song to rate it.</p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-score-you">
          {error.text}
          {error.needsProfile && (
            <>
              {" "}
              <Link href="/profile" className="font-medium underline underline-offset-4">
                Pick one now
              </Link>
            </>
          )}
        </p>
      )}

      <ol className="overflow-hidden rounded-xl border border-border">
        {tracks.map((track, i) => {
          const songMbid = track.song_mbid;
          const mine = songMbid ? own[songMbid] : undefined;
          const crowd = songMbid ? community[songMbid] : undefined;
          const isOpen = songMbid !== null && open === songMbid;

          const row = (
            <>
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-text-muted">
                {track.position}
              </span>
              <span className="min-w-0 flex-1 truncate text-text">{track.title}</span>
              {crowd && (
                <span
                  title={`${crowd.count} rating${crowd.count === 1 ? "" : "s"}`}
                  className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-text-secondary"
                >
                  <Star className="h-3.5 w-3.5 text-score-overall" />
                  {crowd.average.toFixed(1)}
                </span>
              )}
              {mine !== undefined && (
                <span className="w-7 shrink-0 rounded-md bg-score-you py-0.5 text-center text-xs font-bold tabular-nums text-[#0b0b0e]">
                  {mine}
                </span>
              )}
              <span className="hidden w-10 shrink-0 text-right text-xs tabular-nums text-text-muted sm:block">
                {formatDuration(track.duration_ms)}
              </span>
            </>
          );

          return (
            <li
              key={track.position}
              className={isOpen ? "bg-surface-raised" : i % 2 ? "bg-surface/40" : ""}
            >
              <div className="flex items-center">
                {artist && (
                  <PlayButton artist={artist} title={track.title} scope={releaseMbid} className="ml-3" />
                )}
                {signedIn && songMbid ? (
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : songMbid)}
                    aria-expanded={isOpen}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-hover"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-sm">
                    {row}
                  </div>
                )}
              </div>

              {isOpen && songMbid && (
                <div className="px-4 pb-4 pt-1">
                  <div
                    role="group"
                    aria-label={`Your score for ${track.title}`}
                    className="grid grid-cols-5 gap-1.5 sm:grid-cols-10"
                  >
                    {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => save(songMbid, n)}
                        aria-pressed={mine === n}
                        className={`h-10 rounded-lg border text-sm font-semibold tabular-nums transition-all active:scale-95 ${
                          mine === n
                            ? "border-score-you bg-score-you text-[#0b0b0e]"
                            : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {mine !== undefined && (
                    <button
                      type="button"
                      onClick={() => save(songMbid, null)}
                      className="mt-3 text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
                    >
                      Remove my score
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {artist && <PreviewCredit scope={releaseMbid} className="mt-2" />}

      {overlay}
    </div>
  );
}
