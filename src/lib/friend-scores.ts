/**
 * What the people you follow gave things, shared by the server code that
 * reads it and the cards in the browser that show it. No server imports, so
 * a client component can hold one of these without dragging the database in.
 */

/** One person you follow, and what they gave an album, artist or song. */
export type FriendScore = {
  username: string;
  name: string;
  avatar_url: string | null;
  score: number;
};

/** Who you follow has rated what, for a page of search results. */
export type SearchFriends = {
  artists: Record<string, FriendScore[]>;
  albums: Record<string, FriendScore[]>;
};

export const NO_FRIENDS: SearchFriends = { artists: {}, albums: {} };

/** Their best score first, so the warmest opinion leads. */
export const bestFirst = (a: FriendScore, b: FriendScore) =>
  b.score - a.score || a.name.localeCompare(b.name);
