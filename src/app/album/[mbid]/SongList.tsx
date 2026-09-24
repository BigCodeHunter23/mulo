"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { rate, removeRating } from "@/app/ratings/actions";
import type { FriendScore } from "@/lib/friend-scores";
import Avatar from "@/components/Avatar";
import { useBadgeUnlock } from "@/components/BadgeUnlock";
import { PlayButton, PreviewCredit } from "@/components/PreviewPlayer";
import { Star } from "@/components/StarScore";
import { haptic } from "@/lib/haptics";

type Song = {
  position: number;
  title: string;
  duration_ms: number | null;
  song_mbid: string | null;
};

/** Up to this many people you follow on a song, and you see their faces. */
const FACES = 3;

/** A song needs this many of them before it can be called a pick or a clash. */
const ENOUGH = 2;

/** How far apart you and them have to be before it's worth pointing out. */
const CLASH = 3;

function formatDuration(ms: number | null) {
  if (!ms) return "";
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

const mean = (scores: FriendScore[]) =>
  scores.reduce((sum, friend) => sum + friend.score, 0) / scores.length;

/** One person's score is a whole number, so don't dress it up as an average. */
const score = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/** Two heads: says "the people you follow" where there's no room for faces. */
function CrewIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
    >
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2" />
    </svg>
  );
}

/**
 * What the people you follow gave a song, at the end of its row: their faces
 * while there are few enough to know by sight, their average and how many
 * once there are more. Either way it's one chip wide, so a record where
 * fifty people have an opinion reads the same as one where two do.
 */
function FriendsChip({ scores }: { scores: FriendScore[] }) {
  const average = mean(scores);
  const names = scores.map((friend) => `${friend.name} ${friend.score}`).join(", ");

  return (
    <span
      title={names}
      className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-score-friends"
    >
      {scores.length <= FACES ? (
        <span className="flex -space-x-1.5">
          {scores.map((friend) => (
            <span key={friend.username} className="block rounded-full ring-1 ring-bg">
              <Avatar url={friend.avatar_url} name={friend.name} size="xs" />
            </span>
          ))}
        </span>
      ) : (
        <CrewIcon />
      )}
      {score(average)}
    </span>
  );
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
  albumTitle,
  tracks,
  community,
  initialOwn,
  friends,
  signedIn,
}: {
  releaseMbid: string;
  /** For finding each song's preview; without it there are no play buttons. */
  artist: string | null;
  /** The record's own title, so previews come from its tracklist. */
  albumTitle: string;
  tracks: Song[];
  community: Record<string, { average: number; count: number }>;
  initialOwn: Record<string, number>;
  /** How the people you follow scored each song, their best first. */
  friends: Record<string, FriendScore[]>;
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
    haptic("select");
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

  /** Opens a song's scores and brings the row to the middle of the screen. */
  function reveal(songMbid: string) {
    setOpen(songMbid);
    document
      .getElementById(`song-${songMbid}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /**
   * The two songs worth saying out loud: the one the people you follow rate
   * highest, and the one you're furthest from them on. Everything else they
   * think is on its own row — this is the line that makes somebody read them.
   */
  const highlights = useMemo(() => {
    const rated = tracks.flatMap((track) => {
      const scores = track.song_mbid ? friends[track.song_mbid] : undefined;
      return scores?.length ? [{ track, scores, mbid: track.song_mbid as string }] : [];
    });
    if (rated.length === 0) return null;

    const crew = new Set(
      rated.flatMap((song) => song.scores.map((friend) => friend.username)),
    );

    let pick: { title: string; mbid: string; average: number } | null = null;
    let clash: { title: string; mbid: string; gap: number; mine: number; theirs: number } | null =
      null;

    for (const song of rated) {
      if (song.scores.length < ENOUGH) continue;
      const average = mean(song.scores);

      if (!pick || average > pick.average) {
        pick = { title: song.track.title, mbid: song.mbid, average };
      }

      const mine = own[song.mbid];
      if (mine === undefined) continue;
      const gap = Math.abs(mine - average);
      if (gap >= CLASH && (!clash || gap > clash.gap)) {
        clash = { title: song.track.title, mbid: song.mbid, gap, mine, theirs: average };
      }
    }

    return { people: crew.size, songs: rated.length, pick, clash };
  }, [tracks, friends, own]);

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

      {highlights && (
        <div className="mb-4 rounded-xl border border-border bg-surface/40 px-3.5 py-2.5 text-xs leading-relaxed text-text-secondary">
          <span className="font-medium text-score-friends">
            {highlights.people} {highlights.people === 1 ? "person" : "people"} you follow
          </span>{" "}
          {highlights.people === 1 ? "has" : "have"} scored{" "}
          {highlights.songs === tracks.length
            ? "the whole record"
            : `${highlights.songs} of these`}
          .
          {highlights.pick && (
            <>
              {" "}
              Their pick is{" "}
              <button
                type="button"
                onClick={() => reveal(highlights.pick!.mbid)}
                className="font-medium text-text underline-offset-4 hover:underline"
              >
                {highlights.pick.title}
              </button>{" "}
              <span className="tabular-nums text-score-friends">
                {score(highlights.pick.average)}
              </span>
              .
            </>
          )}
          {highlights.clash && (
            <>
              {" "}
              You&rsquo;re furthest apart on{" "}
              <button
                type="button"
                onClick={() => reveal(highlights.clash!.mbid)}
                className="font-medium text-text underline-offset-4 hover:underline"
              >
                {highlights.clash.title}
              </button>{" "}
              &mdash; you{" "}
              <span className="tabular-nums text-score-you">{highlights.clash.mine}</span>, them{" "}
              <span className="tabular-nums text-score-friends">
                {score(highlights.clash.theirs)}
              </span>
              .
            </>
          )}
        </div>
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
          const theirs = (songMbid ? friends[songMbid] : undefined) ?? [];
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
              {theirs.length > 0 && <FriendsChip scores={theirs} />}
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
              id={songMbid ? `song-${songMbid}` : undefined}
              className={isOpen ? "bg-surface-raised" : i % 2 ? "bg-surface/40" : ""}
            >
              <div className="flex items-center">
                {artist && (
                  <PlayButton
                    artist={artist}
                    title={track.title}
                    album={albumTitle}
                    anchor={tracks[0]?.title}
                    scope={releaseMbid}
                    className="ml-3"
                  />
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

                  {/* Who gave what. Fifty people is fine in a list somebody
                      opened on purpose; it's only too much on the row. */}
                  {theirs.length > 0 && (
                    <div className="mt-4 border-t border-border pt-3">
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                        What they gave it
                      </p>
                      <ul className="scroll-quiet flex max-h-48 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1">
                        {theirs.map((friend) => (
                          <li key={friend.username}>
                            <Link
                              href={`/u/${friend.username}`}
                              className="flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text"
                            >
                              <Avatar
                                url={friend.avatar_url}
                                name={friend.name}
                                size="sm"
                              />
                              <span className="min-w-0 flex-1 truncate">{friend.name}</span>
                              <span className="w-7 shrink-0 rounded-md bg-score-friends/15 py-0.5 text-center text-xs font-bold tabular-nums text-score-friends">
                                {friend.score}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
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
