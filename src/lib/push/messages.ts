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

export function nameOf(person: Person): string {
  return person.display_name?.trim() || person.username;
}

export function followMessage(follower: Person): PushContent {
  return { title: `${nameOf(follower)} followed you`, url: `/u/${follower.username}` };
}

export function loveMessage(lover: Person, subject: LoveSubject): PushContent {
  const name = nameOf(lover);
  switch (subject.kind) {
    case "album":
      return {
        title: `${name} loved your ${subject.review ? "review" : "rating"} of ${subject.title}`,
        url: `/album/${subject.mbid}`,
      };
    case "artist":
      return {
        title: `${name} loved your rating of ${subject.name}`,
        url: `/artist/${subject.mbid}`,
      };
    case "take":
      return {
        title: `${name} loved your take on ${subject.title}`,
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
  if (!result) {
    return { title: `Today's Versus: ${today.title}.`, body: "Who you got?", url: "/versus" };
  }
  const [l, r] = split(result.left, result.right);
  const title = result.winner
    ? `${result.winner} took ${result.title}, ${Math.max(l, r)}–${Math.min(l, r)}.`
    : `${result.title} finished level, ${l}–${r}.`;
  return { title, body: `Today: ${today.title}. Who you got?`, url: "/versus" };
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
