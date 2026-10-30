import { SOURCE_NAME, type ImportSource } from "@/lib/diary-shared";
import { threadHref } from "@/lib/replies-shared";
import type { PushKind } from "@/lib/push/who";
import type { ReleaseKind } from "@/lib/app-api";
import { KIND_WORD } from "@/lib/releases/words";

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
 * and no longer than `max`, ending in "…" when cut. The zero-width joiner
 * and non-joiner stay: emoji families and some scripts' names need them.
 */
export function clean(text: string, max: number): string {
  const tidy = text
    .replace(/\s+/gu, " ")
    .replace(/(?![‌‍])[\p{Cc}\p{Cf}]/gu, "")
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

/** "Your Last.fm history is in", once an import finishes. Opens your diary. */
export function diaryMessage(source: ImportSource, count: number): PushContent {
  return {
    title: `Your ${SOURCE_NAME[source]} history is in`,
    body: `${count.toLocaleString("en")} album${count === 1 ? "" : "s"} to rate.`,
    url: "/diary",
  };
}

/** A release by an artist somebody follows, as its push names it. */
export type ReleaseLine = { mbid: string; title: string; kind: ReleaseKind; artistName: string };

/**
 * "Tyler, the Creator's new album is out today", opening the album; several
 * on one day go as one: "3 new releases from artists you follow", opening
 * Home, whose shelf lists them.
 */
export function releaseMessage(releases: ReleaseLine[]): PushContent {
  const [only] = releases;
  if (only && releases.length === 1) {
    return {
      title: `${title(only.artistName)}'s new ${KIND_WORD[only.kind]} is out today`,
      body: title(only.title),
      url: `/album/${only.mbid}`,
    };
  }
  return { title: `${releases.length} new releases from artists you follow`, url: "/" };
}

/** What a reply was on. `id` is the review's or take's own id. */
export type ReplySubject =
  | { kind: "album"; mbid: string; id: number; title: string }
  | { kind: "artist"; mbid: string; id: number; name: string }
  | { kind: "take"; day: string; id: number; title: string };

/** The longest a reply's first line runs in a push. */
const LINE_MAX = 100;

/** A reply's first line with words in it, cleaned and cut, for a push's body. */
export function firstLine(body: string): string {
  const line = body.split(/\r?\n/).find((text) => text.trim() !== "") ?? "";
  return clean(line, LINE_MAX);
}

/** "review of Blonde" or "take on Under Pressure", and the thread it opens. */
function described(subject: ReplySubject): { what: string; url: string } {
  switch (subject.kind) {
    case "album":
      return {
        what: `review of ${title(subject.title)}`,
        url: threadHref({ kind: "album", mbid: subject.mbid, id: subject.id }),
      };
    case "artist":
      return {
        what: `review of ${title(subject.name)}`,
        url: threadHref({ kind: "artist", mbid: subject.mbid, id: subject.id }),
      };
    case "take":
      return {
        what: `take on ${title(subject.title)}`,
        url: threadHref({ kind: "take", day: subject.day, id: subject.id }),
      };
  }
}

function withLine(content: { title: string; url: string }, body: string): PushContent {
  const line = firstLine(body);
  return line ? { ...content, body: line } : content;
}

/** "Jo replied to your review of Blonde", with the reply's first line. */
export function replyMessage(replier: Person, subject: ReplySubject, body: string): PushContent {
  const { what, url } = described(subject);
  return withLine({ title: `${nameOf(replier)} replied to your ${what}`, url }, body);
}

/** "Jo mentioned you on Sam's review of Blonde", with the reply's first line. */
export function mentionMessage(
  replier: Person,
  owner: Person,
  subject: ReplySubject,
  body: string,
): PushContent {
  const { what, url } = described(subject);
  return withLine(
    { title: `${nameOf(replier)} mentioned you on ${nameOf(owner)}'s ${what}`, url },
    body,
  );
}
