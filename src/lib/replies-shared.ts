/**
 * Replies' plain rules, shared by the website and the app (`pnpm sync:web`
 * in mulo-app copies this file): how long a reply may be, which @names it
 * holds, and a thread's address. No imports, so it runs anywhere, and it
 * must pass the app's stricter type check (`noUncheckedIndexedAccess`).
 */

/** What a thread hangs off: a written album or artist review, or a Versus take. */
export type ThreadKind = "album" | "artist" | "take";

/** The longest a reply may be; the database holds the same (migration 0024). */
export const REPLY_LIMIT = 1000;

/** The reply box counts down from this many characters. */
export const COUNT_FROM = 900;

/** A thread shows this many replies at most, the newest, oldest first. */
export const THREAD_MAX = 500;

/**
 * Unicode's format characters (direction overrides and isolates, zero-width
 * spaces, soft hyphens), except the zero-width joiner and non-joiner, which
 * emoji families and some scripts need. The same rule as a push's `clean()`.
 */
const FORMAT = /(?![\u200C\u200D])\p{Cf}/gu;

/**
 * A reply's words without format characters, before they're measured or
 * saved, so nobody can flip how a thread reads or post an invisible reply.
 * Line breaks and tabs are left for trimming.
 */
export function withoutFormatting(body: string): string {
  return body.replace(FORMAT, "");
}

/** Only the first five different people named in a reply count. */
export const MENTIONS_MAX = 5;

/** A thread whose review or take is gone, or hidden from you. */
export const THREAD_GONE = "This review has gone.";

/** Where a thread lives. */
export type ThreadAddress =
  | { kind: "album" | "artist"; mbid: string; id: number }
  | { kind: "take"; day: string; id: number };

/** A thread's page: the same address on the website and in the app, so pushes land on it. */
export function threadHref(address: ThreadAddress): string {
  return address.kind === "take"
    ? `/versus/${address.day}/takes/${address.id}`
    : `/${address.kind}/${address.mbid}/reviews/${address.id}`;
}

/**
 * An @name: "@" and a username (3 to 20 letters, digits or underscores, as
 * `USERNAME_PATTERN`), not straight after a letter, digit or underscore (so
 * an email address isn't one), and not running on into more of them.
 */
const MENTION = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g;

/** The different names a reply mentions, lower-cased, the first five only. */
export function parseMentions(body: string): string[] {
  const names: string[] = [];
  for (const match of body.matchAll(MENTION)) {
    const name = match[2]?.toLowerCase();
    if (!name || names.includes(name)) continue;
    names.push(name);
    if (names.length === MENTIONS_MAX) break;
  }
  return names;
}

export type BodyPart = { text: string; mention: string | null };

/**
 * A reply's words in pieces, each @name of a real person its own piece.
 * `people` are the real usernames it names (in their own case); a name
 * that isn't one of them stays plain words.
 */
export function splitMentions(body: string, people: readonly string[]): BodyPart[] {
  const real = new Map(people.map((name) => [name.toLowerCase(), name]));
  const parts: BodyPart[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION)) {
    const name = match[2];
    const username = name ? real.get(name.toLowerCase()) : undefined;
    if (!name || !username || match.index === undefined) continue;
    const at = match.index + (match[1] ?? "").length;
    if (at > last) parts.push({ text: body.slice(last, at), mention: null });
    parts.push({ text: `@${name}`, mention: username });
    last = at + 1 + name.length;
  }
  if (last < body.length || parts.length === 0) {
    parts.push({ text: body.slice(last), mention: null });
  }
  return parts;
}

/** "Reply" with none yet, then "1 reply", "4 replies". */
export function replyCountText(count: number): string {
  if (count === 0) return "Reply";
  return count === 1 ? "1 reply" : `${count} replies`;
}

/** The reply box after Reply on somebody's reply: their @name first, once. */
export function prefillFor(draft: string, username: string): string {
  if (parseMentions(draft).includes(username.toLowerCase())) return draft;
  return draft.trim() === "" ? `@${username} ` : `@${username} ${draft.trimStart()}`;
}
