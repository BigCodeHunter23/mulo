/**
 * The question in the review box.
 *
 * Almost nobody knows what to write about a record, and an empty box that
 * says "Review" gets left empty. Almost everybody knows the answer to
 * "what's the best song on here?". So the box asks something instead, and
 * asks something different from one record to the next.
 *
 * The question is picked from the record's own id, so it is the same every
 * time that page is opened — it doesn't shuffle under someone mid-sentence —
 * while still varying across the catalogue.
 */

const ALBUM = [
  "What's the best song on here?",
  "Is there a skip on it?",
  "When do you put this on?",
  "Where were you when you first heard it?",
  "Who put you on to this?",
  "Does it hold up front to back?",
  "What would you tell someone who's never heard it?",
  "What does it sound like to you?",
];

const ARTIST = [
  "Where should someone start with them?",
  "What's their best record?",
  "What do they do that nobody else does?",
  "When did you get into them?",
  "Overrated or underrated?",
  "What's the one everybody sleeps on?",
];

const SONG = [
  "What makes this one?",
  "When does this hit hardest?",
  "Best part of it?",
  "Where does this rank for you?",
];

const LISTS = { album: ALBUM, artist: ARTIST, song: SONG };

export type PromptKind = keyof typeof LISTS;

/** Small, stable, and good enough to spread ids across a handful of lines. */
function hash(text: string) {
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

export function promptFor(kind: PromptKind, id: string) {
  const list = LISTS[kind];
  return list[hash(id) % list.length];
}

/** Long enough for a real thought, short enough that nobody feels owed an essay. */
export const REVIEW_MAX = 1000;
/** Past this the counter appears, as a nudge rather than a rule. */
export const REVIEW_COMFORTABLE = 240;
