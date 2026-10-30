import "server-only";
import { z } from "zod";
import type { ReleaseKind } from "@/lib/app-api";
import { addDays } from "@/lib/push/zones";
import { readJsonCapped } from "@/lib/read-capped";
import { cleanTitle, isCalendarDay, MAX_ARTISTS } from "@/lib/releases/confirm";
import { mbidSchema } from "@/lib/validation";

/**
 * ListenBrainz's fresh releases: what MusicBrainz knows coming out around a
 * day, read once a day by the clock. The read covers the week behind (a
 * missed day is caught up, and late entries still count) and the month
 * ahead (the shelf's coming soon). No token needed.
 */

const API = "https://api.listenbrainz.org/1/explore/fresh-releases/";
/** How far back the daily read looks, and how far ahead. ListenBrainz allows up to 90 days. */
export const DAYS_BACK = 7;
export const DAYS_AHEAD = 30;
/** The most of an answer read: a month ahead runs to a few megabytes. */
const MAX_BYTES = 20 * 1024 * 1024;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type FreshRelease = {
  /** The release group: the album's id in MusicBrainz, and on MULO. */
  group: string;
  artists: string[];
  /** "2026-10-30" */
  date: string;
  kind: ReleaseKind;
  title: string;
};

/** A release crediting a followed artist, to confirm with MusicBrainz. */
export type Candidate = {
  group: string;
  /**
   * The first credited artist somebody follows: MULO has them, so the row
   * can point at them until MusicBrainz names the first credited artist.
   */
  artist: string;
  /** Every credited artist, followed or not: the followers of each hear about it. */
  artists: string[];
  title: string;
  kind: ReleaseKind;
  /** The day ListenBrainz gave. */
  listed: string;
  /** Known before on another day. */
  moved: boolean;
};

const KINDS: Partial<Record<string, ReleaseKind>> = { Album: "album", EP: "ep" };

const listedRelease = z.object({
  release_group_mbid: mbidSchema,
  artist_mbids: z.array(z.string()),
  release_date: z.string().refine(isCalendarDay),
  release_group_primary_type: z.string().nullish(),
  release_group_secondary_type: z.string().nullish(),
  release_name: z.string(),
});

const answer = z.object({ payload: z.object({ releases: z.array(z.unknown()) }) });

/**
 * One listed release as MULO counts it: an album or EP with no secondary
 * type, on a real day, with a title it can keep. Null for anything else, so
 * one odd listing is skipped rather than failing the day's whole read.
 */
export function toFresh(value: unknown): FreshRelease | null {
  const parsed = listedRelease.safeParse(value);
  if (!parsed.success) return null;
  const release = parsed.data;
  const kind = KINDS[release.release_group_primary_type ?? ""];
  if (!kind || release.release_group_secondary_type) return null;
  const artists = [
    ...new Set(release.artist_mbids.filter((id) => mbidSchema.safeParse(id).success)),
  ].slice(0, MAX_ARTISTS);
  const title = cleanTitle(release.release_name);
  if (artists.length === 0 || !title) return null;
  return {
    group: release.release_group_mbid,
    artists,
    date: release.release_date,
    kind,
    title,
  };
}

async function readWindow(
  day: string,
  days: number,
  direction: "past" | "future",
  fetcher: Fetcher,
): Promise<unknown[]> {
  const query = new URLSearchParams({
    release_date: day,
    days: String(days),
    past: String(direction === "past"),
    future: String(direction === "future"),
  });
  const response = await fetcher(`${API}?${query}`, {
    headers: { "User-Agent": "MULO/0.1 ( https://getmulo.com )" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`ListenBrainz answered ${response.status} for fresh releases`);
  const parsed = answer.safeParse(
    await readJsonCapped(response, MAX_BYTES, "ListenBrainz's fresh releases"),
  );
  if (!parsed.success) {
    throw new Error("ListenBrainz's fresh releases came back in a shape MULO doesn't know");
  }
  return parsed.data.payload.releases;
}

/**
 * The albums and EPs out in the week to `today` and the month after, one per
 * release group, at its earliest listed date. Two small reads: one window
 * reaching both ways would bring a month of the past too, ten times the size.
 */
export async function readFreshReleases(
  today: string,
  fetcher: Fetcher = fetch,
): Promise<FreshRelease[]> {
  const [back, ahead] = await Promise.all([
    readWindow(today, DAYS_BACK, "past", fetcher),
    readWindow(today, DAYS_AHEAD, "future", fetcher),
  ]);
  const groups = new Map<string, FreshRelease>();
  for (const value of [...back, ...ahead]) {
    const fresh = toFresh(value);
    if (!fresh) continue;
    const seen = groups.get(fresh.group);
    if (!seen || fresh.date < seen.date) groups.set(fresh.group, fresh);
  }
  return [...groups.values()];
}

/**
 * The fresh releases worth confirming: by an artist somebody follows, inside
 * the read's window, and either new to MULO or listed on another day than
 * before (`known`: each release group's last listed day).
 */
export function newCandidates(
  fresh: FreshRelease[],
  followed: Set<string>,
  known: Map<string, string>,
  today: string,
): Candidate[] {
  const from = addDays(today, -DAYS_BACK);
  const to = addDays(today, DAYS_AHEAD);
  return fresh.flatMap((release): Candidate[] => {
    const artist = release.artists.find((id) => followed.has(id));
    if (!artist || release.date < from || release.date > to) return [];
    if (known.get(release.group) === release.date) return [];
    return [
      {
        group: release.group,
        artist,
        artists: release.artists,
        title: release.title,
        kind: release.kind,
        listed: release.date,
        moved: known.has(release.group),
      },
    ];
  });
}
