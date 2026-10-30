import "server-only";
import type { Notification } from "@/lib/app-api";
import { coverArtUrl } from "@/lib/musicbrainz";
import { readTimeZone } from "@/lib/push/store";
import { SLOTS } from "@/lib/push/who";
import { addDays, localClock, momentAt, zoneOrSydney } from "@/lib/push/zones";
import { readFollowedReleases, type FollowedRow } from "@/lib/releases/shelf";

type ReleaseLine = Extract<Notification, { kind: "release" }>;

/** How far back the bell lists releases. */
const BELL_DAYS = 30;

/**
 * A line for each release out by `at`: from 10am on its day where they are,
 * when the push goes, and only for releases on or after the day they
 * followed the artist. One found late is still listed, dated by its day.
 */
export function toReleaseLines(rows: FollowedRow[], zone: string, at: Date): ReleaseLine[] {
  return rows.flatMap((row): ReleaseLine[] => {
    const when = momentAt(row.day, SLOTS.release, zone);
    const followedOn = localClock(new Date(row.followedAt), zone).day;
    if (when.getTime() > at.getTime() || row.day < followedOn) return [];
    return [
      {
        kind: "release",
        key: `release-${row.mbid}`,
        at: when.toISOString(),
        release: {
          mbid: row.mbid,
          title: row.title,
          kind: row.kind,
          cover_art_url: coverArtUrl(row.mbid),
          artist: row.artist,
        },
      },
    ];
  });
}

/** The bell's release lines for the last 30 days, on their own clock (their time zone, or Sydney's). */
export async function releaseNotifications(
  userId: string,
  at = new Date(),
): Promise<ReleaseLine[]> {
  const zone = zoneOrSydney(await readTimeZone(userId));
  const today = localClock(at, zone).day;
  const rows = await readFollowedReleases(userId, addDays(today, -BELL_DAYS), today);
  return toReleaseLines(rows, zone, at);
}

/** The newest release line's time, for the bell's dot. */
export async function latestReleaseAt(userId: string, at = new Date()): Promise<string | null> {
  const lines = await releaseNotifications(userId, at);
  return lines.map((line) => line.at).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}
