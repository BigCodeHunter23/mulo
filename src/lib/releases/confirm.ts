import type { ReleaseKind } from "@/lib/app-api";
import { creditText, type MbReleaseGroup } from "@/lib/musicbrainz";
import { addDays } from "@/lib/push/zones";

/** A release waiting for MusicBrainz's say. */
export type Pending = {
  group: string;
  /** The followed artist it's news for. */
  artist: string;
  /** The day ListenBrainz gave. */
  listed: string;
};

/** What MusicBrainz confirmed, for the catalogue and the alerts. */
export type Confirmed = {
  title: string;
  kind: ReleaseKind;
  /** The release day: MusicBrainz's when it has the whole date. */
  date: string;
  /** The first credited artist, whom the catalogue files the album under. */
  primary: { id: string; name: string };
  credit: string | null;
};

/** How far back a first release may be and still be news: a week, as the read looks back. */
const NEWS_DAYS = 7;
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

const KINDS: Partial<Record<string, ReleaseKind>> = { Album: "album", EP: "ep" };

/** MusicBrainz's first date, or ListenBrainz's when MusicBrainz has only the year or month it falls in. */
function dateOf(first: string | undefined, listed: string): string | null {
  if (!first) return listed;
  if (FULL_DATE.test(first)) return first;
  return listed.startsWith(first) ? listed : null;
}

/**
 * Whether MusicBrainz agrees a listed release is a new album or EP by the
 * artist followed: Album or EP, no secondary type (live, compilation,
 * remix…), that artist credited, and first out no more than a week before
 * `today`, so a reissue of an old record isn't news. Null when it doesn't.
 */
export function confirmGroup(
  group: MbReleaseGroup,
  pending: Pending,
  today: string,
): Confirmed | null {
  const kind = KINDS[group["primary-type"] ?? ""];
  if (!kind || (group["secondary-types"] ?? []).length > 0) return null;
  const credit = group["artist-credit"] ?? [];
  const primary = credit[0]?.artist;
  if (!primary || !credit.some((c) => c.artist.id === pending.artist)) return null;
  const date = dateOf(group["first-release-date"], pending.listed);
  if (!date || date < addDays(today, -NEWS_DAYS)) return null;
  return {
    title: group.title,
    kind,
    date,
    primary: { id: primary.id, name: primary.name },
    credit: creditText(credit),
  };
}
