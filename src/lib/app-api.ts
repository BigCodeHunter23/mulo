import type { Badge } from "@/lib/badge-catalog";
import type { FriendScore, SearchFriends } from "@/lib/friend-scores";
import type { RatingKind } from "@/lib/rating-kinds";
import type { DropAlbum } from "@/lib/drop-lineup";
import type { AlbumDay, DiarySource, ImportSource } from "@/lib/diary-shared";
import type { Era, Scene } from "@/lib/eras";
import type { ThreadKind } from "@/lib/replies-shared";
import type {
  VersusMatchup,
  VersusResult,
  VersusSideKey,
  VersusTally,
  VersusView,
} from "@/lib/versus-shared";

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

export type { AlbumDay, DiarySource, ImportSource };

// --- Catalogue, scores and reviews (catalog.ts, ratings.ts, reviews.ts, reactions.ts) ---

export type Artist = {
  mbid: string;
  name: string;
  image_url: string | null;
  bio: string | null;
  /** The Wikipedia article the bio is from, to credit it; null when it isn't Wikipedia's. */
  bio_url: string | null;
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
  /** Whose it is, to block them by. */
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
  review: string | null;
  created_at: string;
  /** Replies on it, leaving out anybody hidden from the viewer; 0 signed out. */
  replies: number;
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

export type Author = {
  /** Their account, to block them by. */
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

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
      /** Replies on the review: 0 for a score with no words, or signed out. */
      replies: number;
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
      /** Replies on the review: 0 for a score with no words, or signed out. */
      replies: number;
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
  /** How many artists they follow. */
  artists: number;
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

// --- Discover, The Charts and The Stack (discover.ts, trending.ts, charts.ts, stack.ts) ---

/** One of the best-rated albums on MULO, with its average and how many backed it. */
export type TopRatedAlbum = AlbumSummary & { average: number; count: number };

export type RotationAlbum = {
  mbid: string;
  title: string;
  artist: string | null;
  cover: string | null;
  /** Different people who rated the album or its songs in the window. */
  people: number;
  average: number;
};

export type HeavyRotation = {
  label: "this week" | "this month";
  albums: RotationAlbum[];
};

export type ChartKind = "albums" | "songs" | "artists";

export type ChartEntry = {
  rank: number;
  mbid: string;
  title: string;
  /** The artist line, absent on an artist chart. */
  subtitle: string | null;
  /** The artist's own mbid, so a song or album row can link onward. */
  artistMbid: string | null;
  coverUrl: string | null;
  year: string | null;
  /** The plain average, which is what gets shown. */
  average: number;
  /** How many people rated it. */
  votes: number;
  /** The weighted score the ordering used. */
  weighted: number;
  /** Where the row points. */
  href: string;
};

export type Chart = {
  kind: ChartKind;
  /** The genre family id, or null for everything. */
  genre: string | null;
  genreName: string | null;
  entries: ChartEntry[];
  /** How many rated things were in the running before the cut. */
  pool: number;
  /** The site-wide average the weighting pulled towards. */
  siteAverage: number;
};

export type StackHit = {
  title: string;
  /** Plays relative to the album's biggest song, 0 to 1, for the bar. */
  share: number;
  /** The most-played song on the record, worth calling out. */
  biggest: boolean;
};

export type StackAlbum = {
  mbid: string;
  title: string;
  artist: string | null;
  cover: string | null;
  year: string | null;
  /** Why it's in the run, shown as a quiet line under the cover. */
  reason: string | null;
  /**
   * The record's tracklist, to jog a memory. A cover and a title often aren't
   * enough to place an album — the moment somebody reads a song they know,
   * they can score it honestly instead of guessing or skipping.
   */
  hits: StackHit[];
  /** True when play counts are known, so the bars and "biggest" mean something. */
  hitsByPlays: boolean;
};

/** A filter a page offers: a genre family, a chart type. */
export type FilterOption<Id extends string = string> = { id: Id; label: string };

// --- The listening diary (diary/, spec 2026-10-29-listening-diary-design.md) ---

/** One album on one day in somebody's diary. */
export type DiaryEntry = {
  id: number;
  /** YYYY-MM-DD, the listener's own day. */
  day: string;
  /** The names as the source gave them, shown until it's matched. */
  artist: string;
  album: string;
  /** The MULO album it was matched to. */
  release: { mbid: string; title: string; cover: string | null; artist: string | null } | null;
  /** "none" once matching gave up, when the owner can say which album it is. */
  matching: "matched" | "pending" | "none";
  /** The diary owner's own score for the album. */
  score: number | null;
  sources: DiarySource[];
  songs: number;
  minutes: number;
  plays: number;
};

/** A month's line: different albums, and minutes. `month` is YYYY-MM. */
export type DiaryMonth = { month: string; albums: number; minutes: number };

export type DiarySourceStatus = {
  source: ImportSource;
  state: "idle" | "importing" | "syncing" | "needs_reconnect";
  lastfmUser: string | null;
  /** How far back a Last.fm import has reached. */
  reachedBack: string | null;
  syncedAt: string | null;
  lastImportAt: string | null;
  lastCount: number | null;
};

/** What only the diary's owner sees. */
export type DiaryOwn = {
  public: boolean;
  sources: DiarySourceStatus[];
  /** Matched albums in the diary not rated yet. */
  waiting: number;
  /** False until the website has a Last.fm key. */
  lastfm: boolean;
};

/** `GET diary/{username}?before=` */
export type DiaryPage =
  | {
      state: "open";
      person: Person;
      entries: DiaryEntry[];
      months: DiaryMonth[];
      /** The `before` for the next page, or null at the end. */
      next: string | null;
      own: DiaryOwn | null;
    }
  /** Somebody else's diary they've kept to themselves. */
  | { state: "private"; person: Person }
  /** Before migration 0025 runs. */
  | { state: "unavailable"; person: Person };

/** `POST diary/entries/batch`: up to `BATCH_MAX` album-days; the last batch says it's done. */
export type DiaryBatch = {
  source: "spotify" | "apple";
  days: AlbumDay[];
  done?: { total: number };
};

export type DiaryBatchResult = { ok: true; added: number; merged: number } | AppError;

/** `POST diary/entries`: Log a listen. */
export type LogListen = { mbid: string; day: string; score?: number };

/**
 * `POST diary/lastfm/start`, with the phone's IANA time zone ("Europe/London"),
 * which a new import reads days by. The body may be left out.
 */
export type LastfmStart = { timeZone?: string };

/** `POST diary/lastfm/start`: Last.fm's approval page, for the browser sheet. */
export type LastfmStartResult = { ok: true; url: string } | AppError;

/** `GET/PATCH me/diary` */
export type DiarySettings = { public: boolean };

// --- The Gauntlet (gauntlet.ts) ---

export type SetProgress = {
  total: number;
  rated: number;
  /** The albums still to rate, oldest first, for a run. */
  remaining: string[];
};

// --- Daily habits (versus-takes.ts, nominations.ts, drop.ts, guess.ts, streak.ts) ---

export type VersusTake = {
  id: number;
  body: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  /** The side they picked. */
  side: VersusSideKey | null;
  reactions: ReactionSummary;
  mine: boolean;
  /** Replies on it, leaving out anybody hidden from the viewer. */
  replies: number;
};

export type Nomination = {
  id: number;
  left: { mbid: string; name: string; image: string | null };
  right: { mbid: string; name: string; image: string | null };
  backers: number;
  /** Whether the signed-in person backs it. */
  mine: boolean;
};

export type Drop = {
  /** Counting from one, forever — the lineup loops but the weeks don't. */
  week: number;
  album: DropAlbum;
  opensAt: string;
  closesAt: string;
  /** The moment this was worked out, for the countdown to start from. */
  now: number;
};

export type GuessAlbum = {
  mbid: string;
  title: string;
  artist: string | null;
  cover: string | null;
  year: string | null;
  score: number;
};

export type Streak = {
  /** Consecutive days, ending today or yesterday. */
  days: number;
  /** Whether today already counts. If not, the streak ends at midnight. */
  today: boolean;
  /** The longest run in the window looked at. */
  best: number;
};

// --- What the website's actions answer (ratings/actions.ts, u/[username]/actions.ts, versus/actions.ts) ---

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

/** A Versus pick. A refusal for having already picked carries that pick and the split. */
export type PickResult =
  | { ok: true; mine: VersusSideKey; tally: VersusTally }
  | { ok: false; error: string; mine?: VersusSideKey; tally?: VersusTally };

// --- The app API's own answers ---

/** What every endpoint answers when something goes wrong. */
export type AppError = { ok: false; error: string };

/**
 * The refusal when an account without a password last signed in too long ago
 * to delete itself or set a first password. The app matches on this exact text
 * to offer "confirm it's you" again, so change it here and sync the app.
 */
export const NOT_FRESH = "Please confirm it's you again.";

/**
 * The 409 from `auth/apple` and `auth/oauth/exchange` when confirming it's
 * them (`expectedUserId`) signed in to some other account. That sign-in is
 * already undone: its session ended, and the account removed if this sign-in
 * had just made it. The app keeps the session it had.
 */
export const OTHER_ACCOUNT = "That's a different account. Use the one you're signed in with.";

/** The ways somebody can sign in. */
export type SignInMethod = "email" | "apple" | "google" | "facebook";

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

/**
 * `POST auth/apple` body: what the iPhone's own Apple sheet hands back. The nonce
 * is the raw one whose SHA-256 hash the sheet was opened with. The one-time
 * code, when sent, is swapped for Apple's refresh token. Answers `AuthResponse`.
 * `expectedUserId`, the signed-in account's id, is sent when confirming it's
 * them: another account is refused with `OTHER_ACCOUNT` (409).
 */
export type AppleSignInInput = {
  identityToken: string;
  nonce: string;
  authorizationCode?: string;
  expectedUserId?: string;
};

/** The sign-ins that go through the browser. Facebook is refused until Meta approves it. */
export type OAuthProvider = "apple" | "google" | "facebook";

/**
 * `POST auth/oauth/start` body. `redirectTo` is where the browser comes back to:
 * exactly `mulo://auth/callback`. `confirm` is true when signing in again to
 * confirm it's them (before deleting, or setting a first password), which
 * makes Google ask which account rather than sign straight back in.
 * `loginHint`, the signed-in account's email, is passed to Google then too,
 * so its chooser starts on that account; it's ignored otherwise.
 */
export type OAuthStartInput = {
  provider: OAuthProvider;
  redirectTo: string;
  confirm?: boolean;
  loginHint?: string;
};

/**
 * `POST auth/oauth/start`: the page to open in the browser, and `state` to hand
 * back to `auth/oauth/exchange` unchanged. Keep `state` on the phone only for
 * the one sign-in; it's what proves the code that comes back is ours.
 */
export type OAuthStartResult = { ok: true; url: string; state: string } | AppError;

/**
 * `POST auth/oauth/exchange` body: the `code` (and `sb_flow_id`, as `flowId`,
 * when the return address carries one) from the address the browser came back
 * to, with `state` from `auth/oauth/start`. Answers `AuthResponse`.
 * `expectedUserId` works as in `AppleSignInInput`.
 */
export type OAuthExchangeInput = {
  code: string;
  flowId?: string;
  state: string;
  expectedUserId?: string;
};

/** The signed-in person's own profile. Null until they've picked a username. */
export type OwnProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  raised_on_mbid: string | null;
};

/** `PUT me/profile`, and any other write that has nothing more to say. */
export type SaveResult = { ok: true } | AppError;

/** Which pushes somebody gets. Every one is on until they turn it off. */
export type NotificationSettings = {
  follows: boolean;
  loves: boolean;
  /** For replies on reviews, which arrive later; on by default like the rest. */
  replies: boolean;
  versus: boolean;
  drop: boolean;
  streak: boolean;
  /** A finished import: "Your Last.fm history is in". */
  diary: boolean;
  /** An artist they follow put out an album or EP: "Tyler, the Creator's new album is out today". */
  releases: boolean;
};

export type PushPlatform = "ios" | "android";

/** A phone asking for pushes: Expo's address for it, and its time zone. */
export type PushDeviceInput = {
  token: string;
  platform: PushPlatform;
  timeZone: string | null;
};

/**
 * `DELETE me`. Body: `{ confirm: "DELETE", current? }`, where `current` is the
 * password, needed only when `Me.hasPassword`; an account without one must
 * have signed in within the last five minutes instead (refused with
 * `NOT_FRESH` otherwise). `appleLinkLeft` means Apple couldn't be
 * told: ask the person to remove MULO under Settings › Apple Account › Sign in
 * with Apple.
 */
export type DeleteResult = { ok: true; appleLinkLeft?: true } | AppError;

/** `GET me` */
export type Me = {
  id: string;
  email: string | null;
  profile: OwnProfile | null;
  /** How this account can sign in. */
  signInMethods: SignInMethod[];
  /** Whether it has a password: email accounts do, social ones only once they set one. */
  hasPassword: boolean;
};

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
  /** Days in a row they've done something on MULO. */
  streak: Streak;
  /** Their GOAT lists, best first. */
  goat: { artists: TopPick[]; albums: TopPick[] };
  /**
   * How closely the signed-in person and this one score the same records.
   * Null signed out, on your own profile, or with too little in common.
   */
  taste: TasteMatch | null;
  /** Their non-empty lists, newest first, for the profile's section (empty signed out). */
  lists: { top: ListSummary[]; count: number };
  /** The record they were raised on. */
  raisedOn: RaisedOn | null;
  /** The latest matched entries of their diary, when you may see it; empty otherwise. */
  diary: DiaryEntry[];
};

/**
 * `GET discover`, the browsable shelves. Each is empty when there's too
 * little to show (the website's own thresholds) or its read failed, so the
 * app leaves it out.
 */
export type DiscoverPage = {
  /** What MULO has in heavy rotation; null in a quiet week. */
  rotation: HeavyRotation | null;
  newReleases: AlbumSummary[];
  topRated: TopRatedAlbum[];
  mostPlayed: AlbumSummary[];
  artistsToExplore: ArtistSummary[];
  /** The latest ratings from everybody. */
  justRated: FeedItem[];
  /** The signed-in person's own scores for the albums above, by mbid. */
  mine: Record<string, number>;
  /** A few recent lists (empty signed out). */
  lists: ListSummary[];
};

/** `GET charts?type=&genre=` */
export type ChartPage = {
  chart: Chart;
  /** Which of the chart the signed-in person has rated, and what they gave each. */
  progress: { yours: Record<string, number>; rated: number; total: number };
  kinds: FilterOption<ChartKind>[];
  genres: FilterOption[];
};

/** `GET stack?decade=&genre=`, a fresh run of records to rate. */
export type StackRun = {
  albums: StackAlbum[];
  /** The filters this run was drawn with, once checked. */
  decade: number | null;
  genre: string | null;
  decades: number[];
  genres: FilterOption[];
  /** "listening" for the From your listening deck. */
  from: "listening" | null;
  /** How many albums from your listening wait for a score; the choice shows above 0. */
  listening: number;
};

/** A Versus's takes, as far as the viewer may see them. */
export type VersusTakes = {
  /** False until the takes table exists, so the section stays hidden. */
  available: boolean;
  /** How many there are, shown even before the viewer picks. */
  count: number;
  /** Empty until the viewer picks or the matchup closes, so nobody's talked into a side. */
  takes: VersusTake[];
};

/** `GET versus`, the Versus page (`versus/VersusScreen.tsx`). */
export type VersusPage = {
  /** Null when today's matchup couldn't be set up. */
  today: VersusView | null;
  takes: VersusTakes;
  /** Yesterday's result; null when there wasn't one or nobody picked. */
  yesterday: VersusView | null;
  /** The most-backed nominations. */
  nominations: Nomination[];
};

/** `GET versus/[day]`, one day's matchup: today's, or a finished one. */
export type VersusDayPage = { view: VersusView; takes: VersusTakes };

/** `GET drop`, The Drop (`drop/page.tsx`). */
export type DropPage = {
  drop: Drop;
  cover: string | null;
  year: string | null;
  /** The signed-in person's rating of the week's album. */
  own: OwnRating;
  results: {
    count: number;
    /** How many rated it during this drop's week. */
    thisWeek: number;
    /** The viewer's score; until there is one, the spread and average stay hidden. */
    yours: number | null;
    average: number | null;
    /** How many gave each score, 1 to 10. */
    spread: number[] | null;
  };
  /** The six most loved reviews, once the viewer has rated. */
  reviews: Review[];
  reactions: Record<number, ReactionSummary>;
};

/** `GET guess`, a fresh game of Guess the score. */
export type GuessGame = { albums: GuessAlbum[] };

// --- Collection (badges.ts, milestone-card.ts, top-picks.ts, mixtape.ts, gauntlet.ts, rating-style.ts, taste.ts, head-to-head.ts, taste-twin.ts, receipts.ts) ---

export type BoardBadge = {
  slug: string;
  name: string;
  earned: boolean;
  /** Only filled in once earned. Locked ones keep their secret. */
  description: string | null;
};

export type BoardGroup = { id: string; title: string; badges: BoardBadge[] };

export type BoardLadder = {
  id: string;
  name: string;
  /** Albums rated in this genre so far. */
  rated: number;
  tiers: { slug: string; name: string; earned: boolean }[];
};

export type BadgeBoard = {
  earned: number;
  total: number;
  groups: BoardGroup[];
  ladders: BoardLadder[];
};

export type MilestoneCard = {
  count: number;
  profile: {
    id: string;
    username: string;
    name: string;
    avatarUrl: string | null;
  };
  average: number | null;
  /** Their highest-scored albums, for the cover row. */
  top: {
    mbid: string;
    title: string;
    artist: string | null;
    cover: string | null;
    score: number;
  }[];
};

export type PickKind = "artist" | "album";

/** One entry in somebody's ranked top ten, ready to render. */
export type TopPick = {
  mbid: string;
  title: string;
  subtitle: string | null;
  image: string | null;
};

export type PickSuggestions = {
  /** "rated": their own ratings, best first. "popular": a start for new accounts. */
  source: "rated" | "popular";
  picks: (TopPick & { score: number | null })[];
};

export type MixtapePick = {
  key: string;
  /** The album, song or artist. */
  mbid: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  href: string;
  score: number;
};

export type RankOffKind = "album" | "song";

/** Albums or songs sharing the month's top score, which can be ranked off. */
export type Tie = {
  contenders: MixtapePick[];
  /** A rank-off already crowned one of them. */
  settled: boolean;
};

export type Mixtape = {
  /** "2026-09" */
  month: string;
  /** "September 2026" */
  label: string;
  albums: number;
  songs: number;
  artists: number;
  average: number | null;
  topAlbum: MixtapePick | null;
  topSong: MixtapePick | null;
  topArtist: (MixtapePick & { rated: number }) | null;
  /** Set only when more than one album, or song, shares the top score. */
  albumTie: Tie | null;
  songTie: Tie | null;
  /** Whether rank-off results can be saved yet. */
  rankOffs: boolean;
  /** The best of the month, across all three, highest first. */
  highlights: MixtapePick[];
};

export type RankedAlbum = {
  mbid: string;
  title: string;
  year: string | null;
  cover: string | null;
  score: number;
};

export type Standout = {
  mbid: string;
  title: string;
  artist: string | null;
  cover_art_url: string | null;
  yours: number;
  theirs: number;
  gap: number;
};

export type RatingStyle = {
  /** Albums they've rated that anybody else has rated too. */
  compared: number;
  /** Their average on those, and everyone else's. */
  yours: number;
  everyone: number;
  /** Positive: kinder than the crowd. Negative: harsher. */
  gap: number;
  /** The record they're furthest above the crowd on, and furthest below. */
  champion: Standout | null;
  sceptic: Standout | null;
  /** Decades and genres they're kindest and hardest on, with enough rated to mean it. */
  decades: { label: string; gap: number; count: number }[];
  genres: { label: string; gap: number; count: number }[];
};

export type TasteMatch = {
  /** Out of 100: how closely two people score the same records. */
  percent: number;
  /** How many things they have both rated. */
  shared: number;
  /** Where they disagree most, which is the fun part. */
  clash: {
    title: string;
    subtitle: string | null;
    href: string;
    yours: number;
    theirs: number;
  } | null;
};

export type Clash = {
  title: string;
  subtitle: string | null;
  href: string;
  coverUrl: string | null;
  yours: number;
  theirs: number;
};

export type BlindSpot = {
  title: string;
  subtitle: string | null;
  href: string;
  coverUrl: string | null;
  score: number;
};

export type HeadToHead = {
  /** False when there isn't enough in common yet; only `shared` means anything. */
  ready: boolean;
  percent: number;
  shared: number;
  /** Rated exactly the same. */
  identical: number;
  /** Within a point of each other. */
  close: number;
  /** Three or more apart — the arguments. */
  apart: number;
  clashes: Clash[];
  agreements: Clash[];
  /** They rate it highly and you have never rated it. */
  fromThem: BlindSpot[];
  /** You rate it highly and they have never rated it. */
  fromYou: BlindSpot[];
};

export type TasteTwin = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  percent: number;
  shared: number;
  /** Something you both love, to open the conversation with. */
  agreement: { title: string; href: string; yours: number; theirs: number } | null;
  following: boolean;
};

export type Receipt = {
  mbid: string;
  title: string;
  artist: string | null;
  cover_art_url: string | null;
  /** What they gave it, and when. */
  score: number;
  rated_at: string;
  /** Everybody else's average now, if anybody else has rated it. */
  everyone: number | null;
};

/** `GET users/[username]/badges`: the profile's badges row and the whole board. */
export type BadgesPage = {
  profile: PublicProfile;
  isSelf: boolean;
  /** The row on the profile: each ladder's highest tier, then the solo badges. */
  badges: Badge[];
  board: BadgeBoard;
};

/** `GET users/[username]/milestone/[count]`, a milestone's share card. */
export type MilestonePage = { card: MilestoneCard; isSelf: boolean };

/** `GET users/[username]/mixtape/[month]` */
export type MixtapePage = {
  profile: PublicProfile;
  isSelf: boolean;
  mixtape: Mixtape;
  /** The month before, always there. */
  previous: string;
  /** The month after; null when that would be in the future. */
  next: string | null;
};

/** `GET users/[username]/ranks/[artist]`, one person's ranking of an artist's albums. */
export type RankingPage = {
  profile: PublicProfile;
  isSelf: boolean;
  artist: ArtistRef;
  /** Best first; a tie goes to the older record. */
  ranked: RankedAlbum[];
  /** How many albums the artist has, so a ranking can say how complete it is. */
  total: number;
};

/** `GET users/[username]/taste`, how somebody rates. */
export type TastePage = {
  profile: PublicProfile;
  isSelf: boolean;
  /** Null until there's enough to judge. */
  style: RatingStyle | null;
  /** How many records with other scores it takes before there is. */
  enough: number;
};

/** `GET users/[username]/vs`, the signed-in person against somebody else. */
export type HeadToHeadPage = {
  profile: PublicProfile;
  head: HeadToHead | null;
  /** How many records in common it takes before it's ready. */
  minimum: number;
};

/** `GET goat?kind=`, the GOAT builder. */
export type GoatPage = { kind: PickKind; picks: TopPick[]; suggestions: PickSuggestions };

/** `GET artists/[mbid]/gauntlet`, what's left of a Gauntlet run. */
export type GauntletPage = {
  artist: ArtistRef;
  /** The albums still to rate, oldest first, as Stack cards. */
  run: StackAlbum[];
  /** Every album the artist has. */
  total: number;
};

/** `GET me/home`, what Home adds to the feed. */
export type HomeExtras = {
  /** This week's taste twin; null when nobody's close enough. */
  twin: TasteTwin | null;
  /** An old score to stand by or change; null when there isn't one old enough. */
  receipt: (Receipt & { howLongAgo: string }) | null;
};

// ── Lists ──────────────────────────────────────────────────────────────

/** A list, as a card shows it. */
export type ListSummary = {
  id: number;
  title: string;
  description: string | null;
  ranked: boolean;
  updatedAt: string;
  count: number;
  /** The first few covers, for a thumbnail. */
  covers: string[];
  ownerId: string;
  owner: { username: string; name: string; avatarUrl: string | null };
};

export type ListItem = {
  mbid: string;
  position: number;
  note: string | null;
  title: string;
  artist: string | null;
  cover: string | null;
  year: string | null;
};

export type ListDetail = Omit<ListSummary, "count" | "covers"> & { items: ListItem[] };

/** What a list action answers; `id` is the new list's, after creating one. */
export type ListResult = { ok: true; id?: number } | { ok: false; error: string };

/** `GET lists`: yours, then everyone's latest. */
export type ListsPage = { mine: ListSummary[]; recent: ListSummary[] };

/** `GET lists/[id]` */
export type ListPage = { list: ListDetail; isOwner: boolean; limit: number };

/** One of your lists, beside an album: whether it's on it, and whether there's room. */
export type MyList = { id: number; title: string; has: boolean; full: boolean };

/** `GET albums/[mbid]/lists`: Add to list's ticks, and "On these lists". */
export type AlbumLists = { mine: MyList[]; featured: ListSummary[] };

// ── Replies (replies.ts) ───────────────────────────────────────────────

/** `POST replies` */
export type ReplyInput = { kind: ThreadKind; targetId: number; body: string };

/** One reply in a thread. */
export type Reply = {
  id: number;
  body: string;
  createdAt: string;
  author: Person;
  /** The real people it @names, by their own usernames, for links. */
  mentions: string[];
  /** Yours: nothing to report. */
  mine: boolean;
  /** Yours, or on your own review or take. */
  canDelete: boolean;
};

/**
 * What a thread is about. A review is shaped like a feed item (`kind`,
 * `ratingId`, `reaction`) and a take is a `VersusTake`, so a love or a nah
 * changes it wherever it shows.
 */
export type ThreadHead =
  | {
      kind: "album";
      ratingId: number;
      reaction: ReactionSummary;
      created_at: string;
      author: Author;
      score: number;
      review: string;
      release: FeedAlbum;
    }
  | {
      kind: "artist";
      ratingId: number;
      reaction: ReactionSummary;
      created_at: string;
      author: Author;
      score: number;
      review: string;
      artist: { mbid: string; name: string; image_url: string | null };
    }
  | { kind: "take"; take: VersusTake; matchup: VersusMatchup };

/** `GET threads/{album|artist|take}/{id}` */
export type ThreadPage =
  | {
      state: "open";
      head: ThreadHead;
      /** Oldest first, leaving out anybody hidden from the viewer; none signed out. */
      replies: Reply[];
      /** Signed in, and replies exist. */
      canReply: boolean;
      /** False until migration 0024 runs: no replies, and none can be posted. */
      available: boolean;
    }
  /** The review or take was deleted or cleared, or its writer is hidden from you. */
  | { state: "gone" }
  /** A take on today's Versus before you've picked: pick first, as on the Versus page. */
  | { state: "locked"; day: string };

/** `POST replies`: the saved reply, to show in place of the one on its way. */
export type ReplyResult = { ok: true; reply: Reply } | AppError;

// ── Notifications ──────────────────────────────────────────────────────

export type Person = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type Notification =
  | { kind: "follow"; key: string; at: string; person: Person }
  | {
      kind: "reaction";
      key: string;
      at: string;
      person: Person;
      /** 1 for a love, -1 for a nah. */
      value: 1 | -1;
      /** What was reacted to: a rating, a Versus pick, or a take. */
      on: "rating" | "pick" | "take";
      subject: { title: string; href: string };
      /** For a pick, the artist they picked. */
      picked?: string;
    }
  /**
   * Somebody they follow rated a record they have rated too. Both scores ride
   * along so the line can put the two numbers side by side, which is the whole
   * reason to tap it.
   */
  | {
      kind: "also-rated";
      key: string;
      at: string;
      person: Person;
      subject: { title: string; href: string };
      yours: number;
      theirs: number;
    }
  /** Replies on the viewer's own review or take, one line per thread; `person` wrote the newest. */
  | {
      kind: "reply";
      key: string;
      at: string;
      person: Person;
      /** How many other people replied too. */
      others: number;
      on: "review" | "take";
      /** The record's or matchup's title, and the thread's address. */
      subject: { title: string; href: string };
    }
  /** Somebody named the viewer in a reply on somebody else's review or take. */
  | {
      kind: "mention";
      key: string;
      at: string;
      person: Person;
      /** Whose review or take it is, by name. */
      owner: string;
      on: "review" | "take";
      subject: { title: string; href: string };
    }
  /** Newer replies in a thread the viewer replied in; `person` wrote the newest. */
  | {
      kind: "thread";
      key: string;
      at: string;
      person: Person;
      count: number;
      owner: string;
      on: "review" | "take";
      subject: { title: string; href: string };
    }
  /** Today's Daily Versus is up and they haven't picked yet. */
  | { kind: "versus-live"; key: string; at: string; matchup: VersusMatchup }
  /** A Versus they picked in has closed. */
  | { kind: "versus-result"; key: string; at: string; result: VersusResult }
  /** An import finished: "Your Last.fm history is in: 820 albums to rate." */
  | { kind: "diary-import"; key: string; at: string; source: ImportSource; count: number };

/** `GET notifications`; `following` marks who already gets a Follow back. */
export type NotificationsPage = { notifications: Notification[]; following: string[] };

/** `GET notifications/latest`: the newest one's time, for the bell's dot. */
export type LatestNotification = { latest: string | null };

// ── Reports, follows, invites, blocks ──────────────────────────────────

/** What a report is about: a review (album or artist), a take, a list, a reply or a person. */
export type ReportTarget =
  | { kind: "rating" | "artistRating" | "take" | "list" | "reply"; id: number }
  | { kind: "profile"; id: string };

/** A report's answer: a thank-you, including for one already sent. */
export type ReportResult = { ok: true; message: string } | AppError;

/** `GET users/[username]/follows?show=&page=` */
export type FollowsPage = { people: PublicProfile[]; following: string[]; hasMore: boolean };

/** `POST me/invite`: the full join link. */
export type InviteResult = { ok: true; url: string } | AppError;

export type BlockedPerson = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

// ── Profile and account ────────────────────────────────────────────────

export type RaisedOn = {
  era: Era | null;
  scene: Scene | null;
  album: {
    mbid: string;
    title: string;
    artist: string | null;
    cover: string | null;
    year: number | null;
  };
};

/** `GET me/profile`: what the edit screen starts from. */
export type EditableProfile = {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  raisedOn: RaisedOn | null;
};

/** `POST me/avatar` */
export type AvatarResult = { ok: true; avatarUrl: string } | AppError;

/**
 * Password and email changes answer with the website's own words.
 * `PUT me/password` `{ current, next }` changes a password; `POST me/password`
 * `{ next }` sets a first one for an account without (`Me.hasPassword` false),
 * which must have signed in within the last five minutes. `PUT me/email` needs
 * a password. `Me.hasPassword` catches up once the app refreshes its token.
 */
export type AccountResult = { ok: true; message: string } | AppError;

// ── Following artists and new releases ─────────────────────────────────

/** What counts as a release worth following: albums and EPs, never singles or live records. */
export type ReleaseKind = "album" | "ep";

/**
 * `POST` and `DELETE artists/[mbid]/follow`. `first` marks somebody's first
 * artist follow: the suggestions card is offered once, there and then.
 */
export type ArtistFollowResult =
  { ok: true; first?: true } | { ok: false; error: string; needsLogin?: boolean };
