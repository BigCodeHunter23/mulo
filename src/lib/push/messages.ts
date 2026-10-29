import type { PushKind } from "@/lib/push/who";

/**
 * The words of every push, in MULO's voice (docs/voice.md): short, plain, no
 * exclamation marks or emoji. `url` is the page the push opens, the same
 * address on the website and in the app.
 */

export type PushContent = { title: string; body?: string; url: string };

/** A push for one person. `key` makes it once-only in the log (migration 0023). */
export type PushMessage = PushContent & { userId: string; kind: PushKind; key: string };

export type Person = { username: string; display_name: string | null };

export type LoveSubject =
  | { kind: "album"; mbid: string; title: string; review: boolean }
  | { kind: "artist"; mbid: string; name: string }
  | { kind: "take"; day: string; title: string };

/** Yesterday's Versus, as one person's push tells it. */
export type VersusLine = { title: string; winner: string | null; left: number; right: number };

/** Longest a person's name, or a record's or matchup's title, may run in a push. */
const NAME_MAX = 40;
const TITLE_MAX = 80;

/**
 * Names and titles come from people (or MusicBrainz), so before they go on a
 * lock screen: no control or format characters (a newline, or a bidi
 * override that makes the push read backwards), one space between words,
 * and no longer than `max`, ending in "…" when cut.
 */
export function clean(text: string, max: number): string {
  const tidy = text
    .replace(/\s+/gu, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/ {2,}/g, " ")
    .trim();
  const chars = Array.from(tidy);
  if (chars.length <= max) return tidy;
  const cut = chars.slice(0, max - 1).join("");
  return `${cut.trimEnd()}…`;
}

const title = (text: string) => clean(text, TITLE_MAX);

export function nameOf(person: Person): string {
  return clean(person.display_name ?? "", NAME_MAX) || clean(person.username, NAME_MAX);
}

export function followMessage(follower: Person): PushContent {
  return { title: `${nameOf(follower)} followed you`, url: `/u/${follower.username}` };
}

export function loveMessage(lover: Person, subject: LoveSubject): PushContent {
  const name = nameOf(lover);
  switch (subject.kind) {
    case "album":
      return {
        title: `${name} loved your ${subject.review ? "review" : "rating"} of ${title(subject.title)}`,
        url: `/album/${subject.mbid}`,
      };
    case "artist":
      return {
        title: `${name} loved your rating of ${title(subject.name)}`,
        url: `/artist/${subject.mbid}`,
      };
    case "take":
      return {
        title: `${name} loved your take on ${title(subject.title)}`,
        url: `/versus/${subject.day}`,
      };
  }
}

/** Whole percentages that add up to 100. */
export function split(left: number, right: number): [number, number] {
  const total = left + right;
  if (total === 0) return [50, 50];
  const l = Math.round((100 * left) / total);
  return [l, 100 - l];
}

export function versusMessage(today: { title: string }, result?: VersusLine): PushContent {
  const matchup = title(today.title);
  if (!result) {
    return { title: `Today's Versus: ${matchup}.`, body: "Who you got?", url: "/versus" };
  }
  const [l, r] = split(result.left, result.right);
  const yesterday = title(result.title);
  const line = result.winner
    ? `${title(result.winner)} took ${yesterday}, ${Math.max(l, r)}–${Math.min(l, r)}.`
    : `${yesterday} finished level, ${l}–${r}.`;
  return { title: line, body: `Today: ${matchup}. Who you got?`, url: "/versus" };
}

export function dropMessage(): PushContent {
  return {
    title: "This week's Drop is in.",
    body: "Rate it before you see the scores.",
    url: "/drop",
  };
}

export function streakMessage(days: number): PushContent {
  return { title: `Your ${days}-day streak ends at midnight.`, url: "/stack" };
}
