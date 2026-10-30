import "server-only";
import type { ReleaseKind } from "@/lib/app-api";
import { coverArtUrl } from "@/lib/musicbrainz";
import type { Confirmed, Pending } from "@/lib/releases/confirm";
import type { Candidate } from "@/lib/releases/fresh";
import { toKind } from "@/lib/releases/words";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/supabase/errors";
import { readAll } from "@/lib/supabase/read-all";

/**
 * Everything the clock keeps about new releases (migration 0026), read and
 * written with the service role: the day's read of ListenBrainz, the
 * releases found and confirmed, and who follows their artists.
 */

const db = () => createAdminClient();

/** `.in()` puts every id in the address, so long lists go this many at a time. */
const CHUNK = 100;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Claims one try at a UTC day's read: false once it's done, or tried four times. */
export async function claimRead(day: string): Promise<boolean> {
  const { data, error } = await db().rpc("claim_release_read", { p_day: day });
  if (error) throw error;
  return data === true;
}

export async function markRead(day: string, at = new Date()): Promise<void> {
  const { error } = await db()
    .from("artist_release_reads")
    .update({ read_at: at.toISOString() })
    .eq("day", day);
  if (error) throw error;
}

/** Of these artists, the ones at least one person follows. */
export async function followedAmong(artists: string[]): Promise<Set<string>> {
  if (artists.length === 0) return new Set();
  const { data, error } = await db().rpc("followed_among", { p_mbids: artists });
  if (error) throw error;
  return new Set((data ?? []).flatMap((row) => (row.artist_mbid ? [row.artist_mbid] : [])));
}

/** The day each of these release groups was last listed on, for those MULO has. */
export async function listedDates(groups: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const chunk of chunks(groups)) {
    const { data, error } = await db()
      .from("new_releases")
      .select("release_group_mbid, listed_date")
      .in("release_group_mbid", chunk);
    if (error) throw error;
    for (const row of data ?? []) found.set(row.release_group_mbid, row.listed_date);
  }
  return found;
}

/** Files releases to confirm; one listed on a new day is asked about again. */
export async function queueReleases(candidates: Candidate[]): Promise<void> {
  for (const chunk of chunks(candidates)) {
    const { error } = await db()
      .from("new_releases")
      .upsert(
        chunk.map((c) => ({
          release_group_mbid: c.group,
          artist_mbid: c.artist,
          artist_mbids: c.artists,
          title: c.title,
          kind: c.kind,
          release_date: c.listed,
          listed_date: c.listed,
          confirmed_at: null,
          refused_at: null,
        })),
        { onConflict: "release_group_mbid" },
      );
    if (error) throw error;
  }
}

/** Releases waiting for MusicBrainz, the longest waiting first. */
export async function pendingReleases(limit: number): Promise<Pending[]> {
  const { data, error } = await db()
    .from("new_releases")
    .select("release_group_mbid, artist_mbids, listed_date")
    .is("confirmed_at", null)
    .is("refused_at", null)
    .order("found_at")
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    group: row.release_group_mbid,
    artists: row.artist_mbids,
    listed: row.listed_date,
  }));
}

/**
 * A confirmed release: into the catalogue, so its album page and its
 * artist's page show it at once, and marked confirmed with MusicBrainz's
 * title, kind, date and credits (shown as its first credited artist). One
 * already cached keeps its details and takes the date and kind.
 */
export async function saveConfirmed(
  group: string,
  confirmed: Confirmed,
  at = new Date(),
): Promise<void> {
  const client = db();
  const artist = await client
    .from("artists")
    .upsert(
      { mbid: confirmed.primary.id, name: confirmed.primary.name },
      { onConflict: "mbid", ignoreDuplicates: true },
    );
  if (artist.error) throw artist.error;
  const added = await client.from("releases").upsert(
    {
      mbid: group,
      title: confirmed.title,
      artist_mbid: confirmed.primary.id,
      release_date: confirmed.date,
      cover_art_url: coverArtUrl(group),
      artist_credit: confirmed.credit,
      kind: confirmed.kind,
    },
    { onConflict: "mbid", ignoreDuplicates: true },
  );
  if (added.error) throw added.error;
  const dated = await client
    .from("releases")
    .update({ release_date: confirmed.date, kind: confirmed.kind })
    .eq("mbid", group);
  if (dated.error) throw dated.error;
  const marked = await client
    .from("new_releases")
    .update({
      title: confirmed.title,
      kind: confirmed.kind,
      release_date: confirmed.date,
      artist_mbid: confirmed.primary.id,
      artist_mbids: confirmed.artists,
      confirmed_at: at.toISOString(),
      refused_at: null,
    })
    .eq("release_group_mbid", group);
  if (marked.error) throw marked.error;
}

/** A release MusicBrainz doesn't agree is a new album or EP: kept, so it isn't asked about again. */
export async function refuseRelease(group: string, at = new Date()): Promise<void> {
  const { error } = await db()
    .from("new_releases")
    .update({ refused_at: at.toISOString() })
    .eq("release_group_mbid", group);
  if (error) throw error;
}

/** A confirmed release, as an alert names it. */
export type DayRelease = {
  mbid: string;
  title: string;
  kind: ReleaseKind;
  day: string;
  /** The first credited artist, whom alerts name. */
  artistMbid: string;
  /** Every credited artist: the followers of each hear about it. */
  artistMbids: string[];
  artistName: string;
};

/** The confirmed releases out on any of these days. */
export async function releasesOn(days: string[]): Promise<DayRelease[]> {
  if (days.length === 0) return [];
  const { data, error } = await db()
    .from("new_releases")
    .select(
      "release_group_mbid, title, kind, release_date, artist_mbid, artist_mbids, artists!inner ( name )",
    )
    .in("release_date", days)
    .not("confirmed_at", "is", null);
  if (error) {
    // Before migration 0026 there's nothing to tell anybody.
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []).flatMap((row): DayRelease[] => {
    const kind = toKind(row.kind);
    return kind
      ? [
          {
            mbid: row.release_group_mbid,
            title: row.title,
            kind,
            day: row.release_date,
            artistMbid: row.artist_mbid,
            artistMbids: row.artist_mbids,
            artistName: row.artists.name,
          },
        ]
      : [];
  });
}

/** Everyone following each of these artists. */
export async function followersOf(artists: string[]): Promise<Map<string, Set<string>>> {
  const followers = new Map<string, Set<string>>();
  for (const chunk of chunks(artists)) {
    const { data, error } = await readAll(
      (from, to) =>
        db()
          .from("artist_follows")
          .select("user_id, artist_mbid")
          .in("artist_mbid", chunk)
          .order("artist_mbid")
          .order("user_id")
          .range(from, to),
      200_000,
    );
    if (error) throw new Error(error.message);
    for (const row of data) {
      const people = followers.get(row.artist_mbid) ?? new Set<string>();
      people.add(row.user_id);
      followers.set(row.artist_mbid, people);
    }
  }
  return followers;
}
