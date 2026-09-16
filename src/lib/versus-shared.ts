/**
 * Daily Versus shapes and small helpers, shared by the server code, the
 * notifications list and the interactive card in the browser.
 */

export type VersusSideKey = "left" | "right";

export const SIDES: readonly VersusSideKey[] = ["left", "right"];

export type VersusSide = {
  mbid: string;
  name: string;
  /** The photo as stored; size it with artistPhotoSrc. */
  image: string | null;
};

export type VersusMatchup = {
  id: number;
  /** The Sydney date it runs, such as "2026-09-17". */
  day: string;
  tagline: string;
  left: VersusSide;
  right: VersusSide;
};

export type VersusPerson = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type VersusTally = {
  left: number;
  right: number;
  /** How the people the viewer follows picked. */
  friends: Record<VersusSideKey, VersusPerson[]>;
};

/** One matchup as one person should see it. */
export type VersusView = {
  matchup: VersusMatchup;
  /** Its day is over, so no more picks. */
  closed: boolean;
  /** When picks stop, as an ISO time. */
  closesAt: string;
  /** When the page was made, so the countdown starts the same everywhere. */
  now: number;
  signedIn: boolean;
  /** The viewer's pick, if they've made one. */
  mine: VersusSideKey | null;
  /** The split, held back until the viewer picks or the matchup closes. */
  tally: VersusTally | null;
  /** How many people the viewer follows have picked, shown before they pick. */
  friendsPicked: number;
};

/** A finished matchup somebody picked in, for their notifications. */
export type VersusResult = {
  matchup: VersusMatchup;
  mine: VersusSideKey;
  tally: VersusTally;
  /** When it closed, as an ISO time. */
  at: string;
};

/** Each side's share of the picks, in whole percentages that add up to 100. */
export function shares(tally: { left: number; right: number }) {
  const total = tally.left + tally.right;
  if (total === 0) return { left: 50, right: 50, total };

  const left = Math.round((tally.left / total) * 100);
  return { left, right: 100 - left, total };
}

/** The side with more picks, or null when it's level. */
export function leader(tally: { left: number; right: number }): VersusSideKey | null {
  if (tally.left === tally.right) return null;
  return tally.left > tally.right ? "left" : "right";
}

/** "sam", "sam and jo", or "sam, jo and 3 others". */
export function peopleList(people: VersusPerson[], shown = 2) {
  const names = people.map((person) => person.display_name || person.username);
  if (names.length <= shown) return names.join(" and ");

  const rest = names.length - shown;
  return `${names.slice(0, shown).join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
}
