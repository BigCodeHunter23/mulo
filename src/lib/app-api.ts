import type { FriendScore, SearchFriends } from "@/lib/friend-scores";
import type { RatingKind } from "@/lib/rating-kinds";
import type { VersusMatchup, VersusSideKey } from "@/lib/versus-shared";

/**
 * Every shape the app API (`src/app/api/app/v1`) answers with, and the ones
 * the website's own pages read, declared once. The lib modules re-export
 * these under their old names, so a page imports them from where it always
 * did.
 *
 * The app copies this file (`pnpm sync:web` in mulo-app), so it stays
 * framework-free: type imports only, and only from files the app copies too.
 * `src/lib/app-api.test.ts` holds it to that.
 */

// --- Catalogue, scores and reviews (catalog.ts, ratings.ts, reviews.ts, reactions.ts) ---

export type Artist = {
  mbid: string;
  name: string;
  image_url: string | null;
  bio: string | null;
};

export type Release = {
  mbid: string;
  title: string;
  artist_mbid: string | null;
  release_date: string | null;
  cover_art_url: string | null;
  genres: string[];
};

export type Track = {
  position: number;
  title: string;
  duration_ms: number | null;
  /** The song, for rating. Null on a tracklist saved before songs existed. */
  song_mbid: string | null;
};

export type ReactionSummary = {
  love: number;
  dislike: number;
  /** What the signed-in person picked, if anything. */
  mine: 1 | -1 | null;
};

export type Review = {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
  review: string | null;
  created_at: string;
};

/** Named to match the mockups: Ovr / You / Friends. */
export type Scores = {
  overall: number | null;
  overallCount: number;
  you: number | null;
  friends: number | null;
  friendsCount: number;
  /** Which of them it was, and what each gave, their best first. */
  friendList: FriendScore[];
  /**
   * True while the overall score still leans on the starting score borrowed
   * from MusicBrainz, so a page can say so rather than passing an outside
   * number off as MULO's own. See `supabase/migrations/0014_seed_ratings.sql`.
   */
  seeded: boolean;
};

export type OwnRating = {
  score: number;
  review: string | null;
} | null;

export type Sort = "recent" | "highest" | "lowest";

export type SongScores = {
  /** Everyone's average for each rated song. */
  community: Record<string, { average: number; count: number }>;
  /** The signed-in person's own score for each song they've rated. */
  own: Record<string, number>;
  /** How the people you follow scored each song, their best first. */
  friends: Record<string, FriendScore[]>;
};

export type TopSong = {
  mbid: string;
  title: string;
  average: number;
  count: number;
  release: { mbid: string; title: string; cover_art_url: string | null };
};

export type ArtistRef = { mbid: string; name: string };

export type AlbumRating = {
  score: number;
  review: string | null;
  created_at: string;
  release: {
    mbid: string;
    title: string;
    cover_art_url: string | null;
    release_date: string | null;
    /** MusicBrainz genre tags, for filtering somebody's ratings by genre. */
    genres?: string[];
    artist: ArtistRef | null;
  };
};

export type ArtistRating = {
  score: number;
  review: string | null;
  created_at: string;
  artist: { mbid: string; name: string; image_url: string | null };
};

export type SongRating = {
  score: number;
  created_at: string;
  song: { mbid: string; title: string };
  release: {
    mbid: string;
    title: string;
    cover_art_url: string | null;
    artist: ArtistRef | null;
  };
};

// --- Feed (feed.ts) ---

export type Author = { username: string; display_name: string | null; avatar_url: string | null };

export type FeedAlbum = {
  mbid: string;
  title: string;
  cover_art_url: string | null;
  artist: { mbid: string; name: string } | null;
};

export type FeedItem =
  | {
      kind: "album";
      key: string;
      /** The rating itself, which is what a love or a nah attaches to. */
      ratingId: number;
      reaction: ReactionSummary;
      created_at: string;
      author: Author;
      score: number;
      review: string | null;
      release: FeedAlbum;
    }
  | {
      kind: "artist";
      key: string;
      ratingId: number;
      reaction: ReactionSummary;
      created_at: string;
      author: Author;
      score: number;
      review: string | null;
      artist: { mbid: string; name: string; image_url: string | null };
    }
  | {
      kind: "songs";
      key: string;
      created_at: string;
      author: Author;
      release: FeedAlbum;
      /** Newest first. */
      songs: { title: string; score: number }[];
    }
  | {
      kind: "pick";
      key: string;
      /** The pick itself, which is what a love or a nah attaches to. */
      ratingId: number;
      reaction: ReactionSummary;
      created_at: string;
      author: Author;
      matchup: VersusMatchup;
      pick: VersusSideKey;
      /** Hidden until the viewer has picked too, or the matchup has closed. */
      revealed: boolean;
    };

// --- People (social.ts) ---

export type PublicProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

export type ProfileStats = {
  followers: number;
  following: number;
  ratings: number;
  averageScore: number | null;
};

// --- Search and discovery (search.ts, discover.ts, search/WiderResults.tsx) ---

export type SearchArtist = {
  mbid: string;
  name: string;
  image_url: string | null;
};

export type SearchAlbum = {
  mbid: string;
  title: string;
  artist: string | null;
  cover_art_url: string | null;
  year: string | null;
};

export type SearchSong = {
  mbid: string;
  title: string;
  album: string;
  albumMbid: string;
  artist: string | null;
  cover_art_url: string | null;
};

export type SearchResults = {
  artists: SearchArtist[];
  albums: SearchAlbum[];
  songs: SearchSong[];
};

export type AlbumSummary = {
  mbid: string;
  title: string;
  artist: string | null;
  cover_art_url: string | null;
  year: string | null;
};

export type ArtistSummary = {
  mbid: string;
  name: string;
  image_url: string | null;
};

export type WiderArtist = { id: string; name: string; disambiguation: string | null };

export type WiderAlbum = { id: string; title: string; artist: string | null; year: string | null };

// --- The Gauntlet (gauntlet.ts) ---

export type SetProgress = {
  total: number;
  rated: number;
  /** The albums still to rate, oldest first, for a run. */
  remaining: string[];
};

// --- What the website's actions answer (ratings/actions.ts, u/[username]/actions.ts) ---

export type RatingResult =
  | {
      ok: true;
      /**
       * Every badge this person now holds, sent back with each saved score.
       * The browser keeps the last list it saw, so anything here that was not
       * there before has just been unlocked and is worth making a fuss of.
       * Badges stay worked out from ratings rather than stored, so this can
       * never drift from the truth.
       */
      badges?: string[];
      /**
       * What everybody else gave the same thing, so a score far from the crowd
       * can be spotted and the person invited to say why.
       */
      crowd?: { average: number; count: number };
      /**
       * Set when this score was somebody's tenth, hundredth (and so on) album,
       * with the share page to celebrate it on.
       */
      milestone?: { count: number; url: string };
    }
  | {
      ok: false;
      error: string;
      needsLogin?: boolean;
      needsProfile?: boolean;
    };

export type FollowResult = { ok: true } | { ok: false; error: string; needsLogin?: boolean };

// --- The app API's own answers ---

/** What every endpoint answers when something goes wrong. */
export type AppError = { ok: false; error: string };

/** A Supabase session, as the app stores it. */
export type AppSession = {
  access_token: string;
  refresh_token: string;
  /** Seconds since 1970, when the access token stops working. */
  expires_at: number | null;
  user: { id: string; email: string | null };
};

/** `POST auth/login` and `POST auth/signup`. No session means "check your email". */
export type AuthResponse = { ok: true; session: AppSession | null; message?: string } | AppError;

/** The signed-in person's own profile. Null until they've picked a username. */
export type OwnProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  raised_on_mbid: string | null;
};

/** `PUT me/profile`, and any other write that has nothing more to say. */
export type SaveResult = { ok: true } | AppError;

/** `GET me` */
export type Me = { id: string; email: string | null; profile: OwnProfile | null };

/** `GET albums/[mbid]` */
export type AlbumPage = {
  release: Release;
  artist: Artist | null;
  scores: Scores;
  own: OwnRating;
  reviews: Review[];
  /** Loves and nahs for each review, by review id. */
  reactions: Record<number, ReactionSummary>;
  /** The question to ask when nobody has reviewed it yet. */
  prompt: string;
};

/** `GET albums/[mbid]/tracks`, slower on a first visit, so asked separately. */
export type AlbumTracks = { tracks: Track[]; scores: SongScores };

/** `GET artists/[mbid]` */
export type ArtistPage = {
  artist: Artist;
  albums: Release[];
  scores: Scores;
  own: OwnRating;
  reviews: Review[];
  reactions: Record<number, ReactionSummary>;
  topSongs: TopSong[];
  /** Everyone's average for each album, unrated ones left out. */
  albumScores: Record<string, number>;
  /** The signed-in person's score for each album they've rated. */
  myAlbumScores: Record<string, number>;
  /** Who among the people you follow rated each album. */
  albumFriends: Record<string, FriendScore[]>;
  /** How much of the discography the signed-in person has rated. Null signed out. */
  setProgress: SetProgress | null;
};

/** `GET artists/[mbid]/similar` (Where Next) */
export type SimilarArtists = { artists: ArtistSummary[] };

/** `GET search?q=` */
export type SearchResponse = SearchResults & { friends: SearchFriends };

/** `GET search/wider?q=`, the whole of MusicBrainz. */
export type WiderSearchResponse = {
  artists: WiderArtist[];
  albums: WiderAlbum[];
  failed: boolean;
};

/** `GET feed` */
export type FeedResponse = { items: FeedItem[] };

/** `GET ratings?kind=&sort=` */
export type RatingsPage = { counts: Record<RatingKind, number>; sort: Sort } & (
  | { kind: "album"; items: AlbumRating[] }
  | { kind: "artist"; items: ArtistRating[] }
  | { kind: "song"; items: SongRating[] }
);

/** `GET people?page=` */
export type PeoplePage = {
  people: PublicProfile[];
  /** Ids of the people the signed-in person follows. */
  following: string[];
  hasMore: boolean;
};

/** `GET users/[username]` */
export type ProfilePage = {
  profile: PublicProfile;
  stats: ProfileStats;
  follow: { signedIn: boolean; isSelf: boolean; isFollowing: boolean };
  /** Their latest ratings, as the feed shows them. */
  recent: FeedItem[];
  /** Their highest-rated albums, the top shelf. */
  highest: AlbumRating[];
};
