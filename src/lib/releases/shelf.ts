import "server-only";
import type { NewRelease, ReleaseKind } from "@/lib/app-api";
import { coverArtUrl } from "@/lib/musicbrainz";
import { readTimeZone } from "@/lib/push/store";
import { addDays, localClock, zoneOrSydney } from "@/lib/push/zones";
import { releaseWhen, toKind } from "@/lib/releases/words";
import { logQueryError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

/** The shelf reaches back four weeks, today included, and a month ahead. */
const DAYS_BACK = 27;
const DAYS_AHEAD = 30;
/** The most it shows. */
const SHELF_MAX = 24;

/** A confirmed release by an artist somebody follows, and when they followed them. */
export type FollowedRow = {
  mbid: string;
  title: string;
  kind: ReleaseKind;
  /** "2026-10-30" */
  day: string;
  artist: { mbid: string; name: string };
  followedAt: string;
};

/**
 * Confirmed releases from `from` to `to` by the artists somebody follows
 * (migration 0026's followed_releases), for the shelf and the bell.
 */
export async function readFollowedReleases(
  userId: string,
  from: string,
  to: string,
): Promise<FollowedRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("followed_releases", {
    p_user: userId,
    p_from: from,
    p_to: to,
  });
  if (error) {
    logQueryError("releases", error, "0026");
    return [];
  }
  return (data ?? []).flatMap((row): FollowedRow[] => {
    const kind = toKind(row.kind);
    const { release_group_mbid: mbid, title, release_date: day, artist_mbid, artist_name } = row;
    if (!kind || !mbid || !title || !day || !artist_mbid || !artist_name || !row.followed_at) {
      return [];
    }
    const artist = { mbid: artist_mbid, name: artist_name };
    return [{ mbid, title, kind, day, artist, followedAt: row.followed_at }];
  });
}

const newestFirst = (a: NewRelease, b: NewRelease) =>
  b.release_date.localeCompare(a.release_date) || a.title.localeCompare(b.title);
const soonestFirst = (a: NewRelease, b: NewRelease) =>
  a.release_date.localeCompare(b.release_date) || a.title.localeCompare(b.title);

/** The shelf: what's out, newest first, then what's coming, soonest first. `today` is the viewer's. */
export function toShelf(rows: FollowedRow[], today: string): NewRelease[] {
  const shelf = rows.map((row): NewRelease => ({
    mbid: row.mbid,
    title: row.title,
    kind: row.kind,
    release_date: row.day,
    cover_art_url: coverArtUrl(row.mbid),
    artist: row.artist,
    when: releaseWhen(row.day, today),
    soon: row.day > today,
  }));
  const out = shelf.filter((release) => !release.soon).sort(newestFirst);
  const soon = shelf.filter((release) => release.soon).sort(soonestFirst);
  return [...out, ...soon].slice(0, SHELF_MAX);
}

/** "New from artists you follow", dated on the viewer's own clock (their time zone, or Sydney's). */
export async function getNewReleases(userId: string, at = new Date()): Promise<NewRelease[]> {
  const today = localClock(at, zoneOrSydney(await readTimeZone(userId))).day;
  const rows = await readFollowedReleases(
    userId,
    addDays(today, -DAYS_BACK),
    addDays(today, DAYS_AHEAD),
  );
  return toShelf(rows, today);
}
