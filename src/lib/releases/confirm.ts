import type { ReleaseKind } from "@/lib/app-api";
import { creditText, type MbReleaseGroup } from "@/lib/musicbrainz";
import { addDays } from "@/lib/push/zones";

/** The most credited artists kept for a release (migration 0026 holds up to 100). */
export const MAX_ARTISTS = 100;

/** The longest title MULO keeps, in characters (migration 0026's check). */
const TITLE_MAX = 500;

/** A release waiting for MusicBrainz's say. */
export type Pending = {
  group: string;
  /** The artists ListenBrainz credited. */
  artists: string[];
  /** The day ListenBrainz gave. */
  listed: string;
  /** How many times confirming it has failed so far. */
  tries: number;
};

/** Whether `day` is a YYYY-MM-DD that exists: no 30 February. */
export function isCalendarDay(day: string): boolean {
  if (!FULL_DATE.test(day)) return false;
  const at = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === day;
}

/**
 * A title as it can be kept: trimmed, without the control characters
 * Postgres refuses (NUL) or nobody should see, and cut to 500 characters,
 * never halfway through one. Null when nothing is left.
 */
export function cleanTitle(title: string): string | null {
  const plain = title.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!plain) return null;
  return Array.from(plain).slice(0, TITLE_MAX).join("").trim();
}

/** What MusicBrainz confirmed, for the catalogue and the alerts. */
export type Confirmed = {
  title: string;
  kind: ReleaseKind;
  /** The release day: MusicBrainz's when it has the whole date. */
  date: string;
  /** The first credited artist, whom the catalogue files the album under and alerts name. */
  primary: { id: string; name: string };
  /** Every credited artist, the first first: the followers of each hear about it. */
  artists: string[];
  credit: string | null;
};

/** How far back a first release may be and still be news: a week, as the read looks back. */
const NEWS_DAYS = 7;
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

const KINDS: Partial<Record<string, ReleaseKind>> = { Album: "album", EP: "ep" };

/**
 * MusicBrainz's first date, or ListenBrainz's when MusicBrainz has only the
 * year or month it falls in, or a day that doesn't exist.
 */
function dateOf(first: string | undefined, listed: string): string | null {
  if (!first || FULL_DATE.test(first)) return first && isCalendarDay(first) ? first : listed;
  return listed.startsWith(first) ? listed : null;
}

/**
 * Whether MusicBrainz agrees a listed release is a new album or EP: Album or
 * EP, no secondary type (live, compilation, remix…), one of the artists
 * ListenBrainz listed credited, and first out no more than a week before
 * `today`, so a reissue of an old record isn't news. Null when it doesn't.
 */
export function confirmGroup(
  group: MbReleaseGroup,
  pending: Pick<Pending, "artists" | "listed">,
  today: string,
): Confirmed | null {
  const kind = KINDS[group["primary-type"] ?? ""];
  if (!kind || (group["secondary-types"] ?? []).length > 0) return null;
  const credit = group["artist-credit"] ?? [];
  const primary = credit[0]?.artist;
  if (!primary || !credit.some((c) => pending.artists.includes(c.artist.id))) return null;
  const title = cleanTitle(group.title);
  const date = dateOf(group["first-release-date"], pending.listed);
  if (!title || !date || date < addDays(today, -NEWS_DAYS)) return null;
  return {
    title,
    kind,
    date,
    primary: { id: primary.id, name: primary.name },
    artists: [...new Set(credit.map((c) => c.artist.id))].slice(0, MAX_ARTISTS),
    credit: creditText(credit),
  };
}
