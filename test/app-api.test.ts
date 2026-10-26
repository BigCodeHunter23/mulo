import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The app API's route layer (`src/app/api/app/v1`): who each endpoint lets
 * in, what it hands the website's own code, and what it answers. The lib
 * functions and actions are stand-ins here; test/actions-auth.test.ts covers
 * the actions themselves.
 */

const caller = vi.hoisted(() => ({
  token: null as string | null,
  user: null as { id: string; email: string | null } | null,
  limited: false,
}));

/** What Supabase answers a log-in, sign-up, refresh or log-out. */
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  refreshSession: vi.fn(),
  admin: { signOut: vi.fn() },
}));

/** Stand-ins for the lib functions the endpoints read through. */
const lib = vi.hoisted(() => ({
  // catalog
  getCachedRelease: vi.fn(),
  getCachedArtist: vi.fn(),
  getCachedArtistAlbums: vi.fn(),
  getCachedTracks: vi.fn(),
  // ratings
  getScores: vi.fn(),
  getOwnRating: vi.fn(),
  getSongScores: vi.fn(),
  getTopSongs: vi.fn(),
  getScoresForReleases: vi.fn(),
  getMyAlbumScores: vi.fn(),
  getFriendRaters: vi.fn(),
  friendsForResults: vi.fn(),
  getOwnRatingCounts: vi.fn(),
  getOwnAlbumRatings: vi.fn(),
  getOwnArtistRatings: vi.fn(),
  getOwnSongRatings: vi.fn(),
  getHighestRatedAlbums: vi.fn(),
  // reviews, reactions
  getReviews: vi.fn(),
  getReactions: vi.fn(),
  // gauntlet, discover, search
  getSetProgress: vi.fn(),
  similarArtists: vi.fn(),
  newReleases: vi.fn(),
  topRatedOnMulo: vi.fn(),
  mostPlayedAlbums: vi.fn(),
  artistsToExplore: vi.fn(),
  searchCatalog: vi.fn(),
  // trending, charts, stack
  getHeavyRotation: vi.fn(),
  getChart: vi.fn(),
  getChartProgress: vi.fn(),
  getStack: vi.fn(),
  // feed
  getFollowingFeed: vi.fn(),
  getGlobalFeed: vi.fn(),
  getUserFeed: vi.fn(),
  // social, blocks
  getOwnProfile: vi.fn(),
  getProfileByUsername: vi.fn(),
  getProfileStats: vi.fn(),
  getFollowState: vi.fn(),
  listProfiles: vi.fn(),
  getFollowingIds: vi.fn(),
  isHidden: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  bearerToken: vi.fn(async () => caller.token),
  getCurrentUser: vi.fn(async () => caller.user),
  createClient: vi.fn(async () => ({})),
}));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: vi.fn(() => ({ auth })) }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  allowAddress: vi.fn(async () => !caller.limited),
  allowUser: vi.fn(async () => !caller.limited),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/catalog", () => ({
  getCachedRelease: lib.getCachedRelease,
  getCachedArtist: lib.getCachedArtist,
  getCachedArtistAlbums: lib.getCachedArtistAlbums,
  getCachedTracks: lib.getCachedTracks,
}));
vi.mock("@/lib/ratings", () => ({
  NO_FRIENDS: { artists: {}, albums: {} },
  getScores: lib.getScores,
  getOwnRating: lib.getOwnRating,
  getSongScores: lib.getSongScores,
  getTopSongs: lib.getTopSongs,
  getScoresForReleases: lib.getScoresForReleases,
  getMyAlbumScores: lib.getMyAlbumScores,
  getFriendRaters: lib.getFriendRaters,
  friendsForResults: lib.friendsForResults,
  getOwnRatingCounts: lib.getOwnRatingCounts,
  getOwnAlbumRatings: lib.getOwnAlbumRatings,
  getOwnArtistRatings: lib.getOwnArtistRatings,
  getOwnSongRatings: lib.getOwnSongRatings,
  getHighestRatedAlbums: lib.getHighestRatedAlbums,
}));
vi.mock("@/lib/reviews", () => ({ getReviews: lib.getReviews }));
vi.mock("@/lib/reactions", () => ({ getReactions: lib.getReactions }));
vi.mock("@/lib/gauntlet", () => ({ getSetProgress: lib.getSetProgress }));
vi.mock("@/lib/discover", async (original) => ({
  // The shelves' sizes and minimums are the real ones.
  SHELVES: (await original<typeof import("@/lib/discover")>()).SHELVES,
  similarArtists: lib.similarArtists,
  newReleases: lib.newReleases,
  topRatedOnMulo: lib.topRatedOnMulo,
  mostPlayedAlbums: lib.mostPlayedAlbums,
  artistsToExplore: lib.artistsToExplore,
}));
vi.mock("@/lib/trending", () => ({ getHeavyRotation: lib.getHeavyRotation }));
vi.mock("@/lib/charts", () => ({
  CHART_KINDS: [
    { id: "albums", label: "Albums", noun: "album" },
    { id: "songs", label: "Songs", noun: "song" },
  ],
  CHART_GENRES: [{ id: "hip-hop", name: "Hip hop" }],
  isChartKind: (value: string) => value === "albums" || value === "songs",
  getChart: lib.getChart,
  getChartProgress: lib.getChartProgress,
}));
vi.mock("@/lib/stack", () => ({
  STACK_DECADES: [1980, 1990],
  STACK_RUN: 10,
  getStack: lib.getStack,
}));
vi.mock("@/lib/search", () => ({ searchCatalog: lib.searchCatalog }));
vi.mock("@/lib/feed", () => ({
  getFollowingFeed: lib.getFollowingFeed,
  getGlobalFeed: lib.getGlobalFeed,
  getUserFeed: lib.getUserFeed,
}));
vi.mock("@/lib/social", () => ({
  getOwnProfile: lib.getOwnProfile,
  getProfileByUsername: lib.getProfileByUsername,
  getProfileStats: lib.getProfileStats,
  getFollowState: lib.getFollowState,
  listProfiles: lib.listProfiles,
  getFollowingIds: lib.getFollowingIds,
}));
vi.mock("@/lib/blocks", () => ({ isHidden: lib.isHidden }));

/** Stand-ins for the website's own actions, which the writes hand straight to. */
const actions = vi.hoisted(() => ({
  rate: vi.fn(),
  removeRating: vi.fn(),
  saveReview: vi.fn(),
  setFollowing: vi.fn(),
  saveProfile: vi.fn(),
}));

vi.mock("@/app/profile/actions", () => ({ saveProfile: actions.saveProfile }));

vi.mock("@/app/ratings/actions", () => ({
  rate: actions.rate,
  removeRating: actions.removeRating,
  saveReview: actions.saveReview,
}));
vi.mock("@/app/u/[username]/actions", () => ({ setFollowing: actions.setFollowing }));

const { TOO_MANY } = await import("@/lib/rate-limit");

const MBID = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const OTHER = "1f9df192-a621-4f54-8850-2c5373b7eac9";
const USER = { id: OTHER, email: "someone@example.com" };

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`https://mulo.test/api/app/v1/${path}`, init);
}

function json(path: string, method: string, body: unknown) {
  return request(path, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Route parameters, as Next hands them to a handler. */
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

function signIn() {
  caller.token = "good";
  caller.user = USER;
}

beforeEach(() => {
  caller.token = null;
  caller.user = null;
  caller.limited = false;
  auth.signInWithPassword.mockReset();
  auth.signUp.mockReset();
  auth.refreshSession.mockReset();
  auth.admin.signOut.mockReset().mockResolvedValue({ data: null, error: null });
  for (const fn of Object.values(lib)) fn.mockReset();
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true });
});

const SESSION = {
  access_token: "access",
  refresh_token: "refresh",
  expires_at: 1_900_000_000,
  user: { id: OTHER, email: "someone@example.com" },
};

describe("POST auth/login", () => {
  const login = async (body: unknown) =>
    (await import("@/app/api/app/v1/auth/login/route")).POST(json("auth/login", "POST", body));

  it("hands back the session", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null });
    const response = await login({ email: "someone@example.com", password: "longenough" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, session: SESSION });
  });

  it("says a wrong password plainly", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });
    const response = await login({ email: "someone@example.com", password: "wrong" });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/doesn't match an account/);
  });

  it("says which field is wrong, before asking Supabase", async () => {
    const response = await login({ email: "", password: "x" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Enter your email address.");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("refuses a body it can't read", async () => {
    const response = (await import("@/app/api/app/v1/auth/login/route")).POST(
      request("auth/login", { method: "POST", body: "{" }),
    );
    expect((await response).status).toBe(400);
  });

  it("refuses over the limit before asking Supabase", async () => {
    caller.limited = true;
    const response = await login({ email: "someone@example.com", password: "longenough" });
    expect(response.status).toBe(429);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("POST auth/signup", () => {
  const signup = async (body: unknown) =>
    (await import("@/app/api/app/v1/auth/signup/route")).POST(json("auth/signup", "POST", body));

  it("asks for a confirmation that lands on the welcome steps", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: OTHER } }, error: null });
    const response = await signup({ email: "someone@example.com", password: "longenough" });
    expect(await response.json()).toEqual({
      ok: true,
      session: null,
      message: "Account created. Check your email for a confirmation link, then log in here.",
    });
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toMatch(
      /\/auth\/confirm\?next=%2Fwelcome%3Fintro%3D1$/,
    );
  });

  it("hands back the session when Supabase signs them straight in", async () => {
    auth.signUp.mockResolvedValue({ data: { session: SESSION, user: { id: OTHER } }, error: null });
    const response = await signup({ email: "someone@example.com", password: "longenough" });
    expect(await response.json()).toEqual({ ok: true, session: SESSION });
  });

  it("refuses a short password before asking Supabase", async () => {
    const response = await signup({ email: "someone@example.com", password: "x" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/at least 6/);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("says an existing account plainly", async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "User already registered" },
    });
    const response = await signup({ email: "someone@example.com", password: "longenough" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/already exists/);
  });

  it("refuses over the limit before asking Supabase", async () => {
    caller.limited = true;
    const response = await signup({ email: "someone@example.com", password: "longenough" });
    expect(response.status).toBe(429);
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe("GET me", () => {
  const me = async () => (await import("@/app/api/app/v1/me/route")).GET();

  it("needs a token", async () => {
    expect((await me()).status).toBe(401);
  });

  it("refuses a token that doesn't verify", async () => {
    caller.token = "expired";
    expect((await me()).status).toBe(401);
  });

  it("answers who you are and your profile", async () => {
    signIn();
    const profile = {
      username: "alex",
      display_name: null,
      avatar_url: null,
      raised_on_mbid: null,
    };
    lib.getOwnProfile.mockResolvedValue(profile);
    expect(await (await me()).json()).toEqual({ ...USER, profile });
    expect(lib.getOwnProfile).toHaveBeenCalledWith(OTHER);
  });

  it("says when there's no username yet", async () => {
    signIn();
    lib.getOwnProfile.mockResolvedValue(null);
    expect((await (await me()).json()).profile).toBeNull();
  });
});

const RELEASE = {
  mbid: MBID,
  title: "To Pimp a Butterfly",
  artist_mbid: OTHER,
  release_date: "2015-03-15",
  cover_art_url: null,
  genres: ["hip hop"],
};
const ARTIST = { mbid: OTHER, name: "Kendrick Lamar", image_url: null, bio: null };
const SCORES = {
  overall: 9.1,
  overallCount: 12,
  you: null,
  friends: null,
  friendsCount: 0,
  friendList: [],
  seeded: false,
};

describe("GET albums/[mbid]", () => {
  const album = async (mbid = MBID) =>
    (await import("@/app/api/app/v1/albums/[mbid]/route")).GET(
      request(`albums/${mbid}`),
      params({ mbid }),
    );

  beforeEach(() => {
    lib.getCachedRelease.mockResolvedValue(RELEASE);
    lib.getCachedArtist.mockResolvedValue(ARTIST);
    lib.getScores.mockResolvedValue(SCORES);
    lib.getOwnRating.mockResolvedValue(null);
    lib.getReviews.mockResolvedValue([{ id: 7 }]);
    lib.getReactions.mockResolvedValue({ 7: { love: 1, dislike: 0, mine: null } });
  });

  it("answers signed out with everything the album page shows", async () => {
    const response = await album();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ release: RELEASE, artist: ARTIST, scores: SCORES, own: null });
    expect(body.reactions).toEqual({ 7: { love: 1, dislike: 0, mine: null } });
    expect(typeof body.prompt).toBe("string");
    expect(lib.getReactions).toHaveBeenCalledWith("album", [7]);
  });

  it("refuses a token that doesn't verify", async () => {
    caller.token = "expired";
    expect((await album()).status).toBe(401);
  });

  it("is 404 for an album that isn't there", async () => {
    lib.getCachedRelease.mockResolvedValue(null);
    expect((await album()).status).toBe(404);
  });

  it("is 404 for something that isn't an id, without looking", async () => {
    expect((await album("nope")).status).toBe(404);
    expect(lib.getCachedRelease).not.toHaveBeenCalled();
  });

  it("is 429 when the catalogue limit is hit", async () => {
    const { RateLimitedError } = await import("@/lib/rate-limit");
    lib.getCachedRelease.mockRejectedValue(new RateLimitedError("catalog"));
    expect((await album()).status).toBe(429);
  });
});

describe("GET albums/[mbid]/tracks", () => {
  it("answers the tracklist with its song scores", async () => {
    const tracks = [
      { position: 1, title: "Wesley's Theory", duration_ms: 287000, song_mbid: OTHER },
      { position: 2, title: "For Free?", duration_ms: 130000, song_mbid: null },
    ];
    const scores = { community: {}, own: {}, friends: {} };
    lib.getCachedTracks.mockResolvedValue(tracks);
    lib.getSongScores.mockResolvedValue(scores);
    const { GET } = await import("@/app/api/app/v1/albums/[mbid]/tracks/route");
    const body = await (await GET(request(`albums/${MBID}/tracks`), params({ mbid: MBID }))).json();
    expect(body).toEqual({ tracks, scores });
    expect(lib.getSongScores).toHaveBeenCalledWith([OTHER]);
  });
});

describe("GET artists/[mbid]", () => {
  const artist = async (mbid = OTHER) =>
    (await import("@/app/api/app/v1/artists/[mbid]/route")).GET(
      request(`artists/${mbid}`),
      params({ mbid }),
    );

  beforeEach(() => {
    lib.getCachedArtist.mockResolvedValue(ARTIST);
    lib.getCachedArtistAlbums.mockResolvedValue([RELEASE]);
    lib.getScores.mockResolvedValue(SCORES);
    lib.getOwnRating.mockResolvedValue(null);
    lib.getReviews.mockResolvedValue([]);
    lib.getReactions.mockResolvedValue({});
    lib.getTopSongs.mockResolvedValue([]);
    lib.getScoresForReleases.mockResolvedValue(new Map([[MBID, 9.1]]));
    lib.getMyAlbumScores.mockResolvedValue(new Map());
    lib.getFriendRaters.mockResolvedValue({});
    lib.getSetProgress.mockResolvedValue({ total: 1, rated: 0, remaining: [MBID] });
  });

  it("answers signed out, with album scores as plain objects", async () => {
    const body = await (await artist()).json();
    expect(body).toMatchObject({ artist: ARTIST, albums: [RELEASE], setProgress: null });
    expect(body.albumScores).toEqual({ [MBID]: 9.1 });
    expect(body.myAlbumScores).toEqual({});
    expect(lib.getFriendRaters).toHaveBeenCalledWith("album", [MBID]);
    expect(lib.getSetProgress).not.toHaveBeenCalled();
  });

  it("adds how much of the discography you've rated when signed in", async () => {
    signIn();
    const body = await (await artist()).json();
    expect(body.setProgress).toEqual({ total: 1, rated: 0, remaining: [MBID] });
    expect(lib.getSetProgress).toHaveBeenCalledWith(OTHER, [MBID]);
  });

  it("is 404 for an artist that isn't there", async () => {
    lib.getCachedArtist.mockResolvedValue(null);
    expect((await artist()).status).toBe(404);
  });

  it("is 404 for something that isn't an id, without looking", async () => {
    expect((await artist("nope")).status).toBe(404);
    expect(lib.getCachedArtist).not.toHaveBeenCalled();
  });
});

describe("GET artists/[mbid]/similar", () => {
  it("answers Where Next", async () => {
    lib.similarArtists.mockResolvedValue([ARTIST]);
    const { GET } = await import("@/app/api/app/v1/artists/[mbid]/similar/route");
    const response = await GET(request(`artists/${OTHER}/similar`), params({ mbid: OTHER }));
    expect(await response.json()).toEqual({ artists: [ARTIST] });
    expect(lib.similarArtists).toHaveBeenCalledWith(OTHER, 6);
  });
});

describe("GET search", () => {
  const RESULTS = { artists: [ARTIST], albums: [], songs: [] };
  const search = async (q: string) =>
    (await import("@/app/api/app/v1/search/route")).GET(
      request(`search?q=${encodeURIComponent(q)}`),
    );

  beforeEach(() => {
    lib.searchCatalog.mockResolvedValue(RESULTS);
    lib.friendsForResults.mockResolvedValue({ artists: { [OTHER]: [] }, albums: {} });
  });

  it("answers signed out with nobody's friends", async () => {
    expect(await (await search("kendrick")).json()).toEqual({
      ...RESULTS,
      friends: { artists: {}, albums: {} },
    });
    expect(lib.searchCatalog).toHaveBeenCalledWith("kendrick", 8);
    expect(lib.friendsForResults).not.toHaveBeenCalled();
  });

  it("adds who you follow has rated what when signed in", async () => {
    signIn();
    expect((await (await search("kendrick")).json()).friends.artists).toEqual({ [OTHER]: [] });
  });

  it("refuses a token that doesn't verify", async () => {
    caller.token = "expired";
    expect((await search("kendrick")).status).toBe(401);
  });

  it("says no politely over the limit", async () => {
    caller.limited = true;
    expect((await search("kendrick")).status).toBe(429);
    expect(lib.searchCatalog).not.toHaveBeenCalled();
  });
});

describe("GET search/wider", () => {
  it("is the website's own MusicBrainz search", async () => {
    const app = await import("@/app/api/app/v1/search/wider/route");
    const site = await import("@/app/api/search/wider/route");
    expect(app.GET).toBe(site.GET);
  });
});

describe("signed-in-only reads", () => {
  it.each([
    ["feed", async () => (await import("@/app/api/app/v1/feed/route")).GET(request("feed"))],
    [
      "ratings",
      async () => (await import("@/app/api/app/v1/ratings/route")).GET(request("ratings")),
    ],
    ["people", async () => (await import("@/app/api/app/v1/people/route")).GET(request("people"))],
    ["stack", async () => (await import("@/app/api/app/v1/stack/route")).GET(request("stack"))],
  ])("%s needs a token", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Log in first." });
  });
});

describe("GET feed", () => {
  const feed = async (query = "") =>
    (await import("@/app/api/app/v1/feed/route")).GET(request(`feed${query}`));

  beforeEach(() => {
    signIn();
    lib.getFollowingFeed.mockResolvedValue([{ key: "a" }]);
    lib.getGlobalFeed.mockResolvedValue([{ key: "b" }]);
  });

  it("is the people you follow by default", async () => {
    expect(await (await feed()).json()).toEqual({ items: [{ key: "a" }] });
    expect(lib.getFollowingFeed).toHaveBeenCalledWith(OTHER);
  });

  it("is everyone on MULO when asked", async () => {
    expect(await (await feed("?scope=everyone")).json()).toEqual({ items: [{ key: "b" }] });
    expect(lib.getGlobalFeed).toHaveBeenCalledWith(24);
  });

  it("refuses a scope it doesn't know", async () => {
    expect((await feed("?scope=mine")).status).toBe(400);
  });
});

describe("GET discover", () => {
  const discover = async () => (await import("@/app/api/app/v1/discover/route")).GET();
  const album = (mbid: string) => ({
    mbid,
    title: mbid,
    artist: null,
    cover_art_url: null,
    year: null,
  });
  const four = ["a", "b", "c", "d"].map(album);

  beforeEach(() => {
    lib.getHeavyRotation.mockResolvedValue(null);
    lib.newReleases.mockResolvedValue(four);
    lib.topRatedOnMulo.mockResolvedValue([]);
    lib.mostPlayedAlbums.mockResolvedValue([album("e")]);
    lib.artistsToExplore.mockResolvedValue([ARTIST]);
    lib.getGlobalFeed.mockResolvedValue([{ key: "f" }]);
    lib.getMyAlbumScores.mockResolvedValue(new Map([["a", 9]]));
  });

  it("answers every shelf, and your own scores for the albums on them", async () => {
    signIn();
    const body = await (await discover()).json();
    expect(body).toEqual({
      rotation: null,
      newReleases: four,
      topRated: [],
      mostPlayed: [album("e")],
      artistsToExplore: [ARTIST],
      justRated: [{ key: "f" }],
      mine: { a: 9 },
    });
    expect(lib.newReleases).toHaveBeenCalledWith(10);
    expect(lib.getMyAlbumScores.mock.calls[0][0]).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("leaves out a shelf below the page's minimum", async () => {
    lib.newReleases.mockResolvedValue(four.slice(0, 3));
    expect((await (await discover()).json()).newReleases).toEqual([]);
  });

  it("leaves out a shelf whose read fails, and keeps the rest", async () => {
    lib.mostPlayedAlbums.mockRejectedValue(new Error("down"));
    const response = await discover();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mostPlayed).toEqual([]);
    expect(body.newReleases).toEqual(four);
  });

  it("is open to somebody signed out, with no scores of their own", async () => {
    const body = await (await discover()).json();
    expect(body.mine).toEqual({});
    expect(lib.getMyAlbumScores).not.toHaveBeenCalled();
  });

  it("keeps who rated what to people with an account, as the page does", async () => {
    const body = await (await discover()).json();
    expect(body.justRated).toEqual([]);
    expect(body.newReleases).toEqual(four);
    expect(lib.getGlobalFeed).not.toHaveBeenCalled();
  });
});

describe("GET charts", () => {
  const charts = async (query = "") =>
    (await import("@/app/api/app/v1/charts/route")).GET(request(`charts${query}`));
  const CHART = {
    kind: "songs",
    genre: "hip-hop",
    genreName: "Hip hop",
    entries: [],
    pool: 0,
    siteAverage: 6.5,
  };

  beforeEach(() => {
    lib.getChart.mockResolvedValue(CHART);
    lib.getChartProgress.mockResolvedValue({ yours: new Map([["x", 8]]), rated: 1, total: 5 });
  });

  it("answers the chart asked for, and what you've rated in it as plain data", async () => {
    const body = await (await charts("?type=songs&genre=hip-hop")).json();
    expect(lib.getChart).toHaveBeenCalledWith("songs", { genre: "hip-hop", limit: 100 });
    expect(body).toEqual({
      chart: CHART,
      progress: { yours: { x: 8 }, rated: 1, total: 5 },
      kinds: [
        { id: "albums", label: "Albums" },
        { id: "songs", label: "Songs" },
      ],
      genres: [{ id: "hip-hop", label: "Hip hop" }],
    });
  });

  it("falls back to every album for a type or genre it doesn't know", async () => {
    await charts("?type=podcasts&genre=nope");
    expect(lib.getChart).toHaveBeenCalledWith("albums", { genre: null, limit: 100 });
  });
});

describe("GET stack", () => {
  const stack = async (query = "") =>
    (await import("@/app/api/app/v1/stack/route")).GET(request(`stack${query}`));

  beforeEach(() => {
    signIn();
    lib.getStack.mockResolvedValue([{ mbid: "a" }]);
  });

  it("draws a run for the signed-in person, with the filters on offer", async () => {
    const body = await (await stack("?decade=1990&genre=hip-hop")).json();
    expect(lib.getStack).toHaveBeenCalledWith(OTHER, 10, { decade: 1990, genre: "hip-hop" });
    expect(body.albums).toEqual([{ mbid: "a" }]);
    expect(body.decade).toBe(1990);
    expect(body.genre).toBe("hip-hop");
    expect(body.decades).toEqual([1980, 1990]);
    expect(body.genres).toContainEqual({ id: "hip-hop", label: "Hip hop" });
  });

  it("ignores a filter it doesn't know", async () => {
    await stack("?decade=1875&genre=nope");
    expect(lib.getStack).toHaveBeenCalledWith(OTHER, 10, { decade: null, genre: null });
  });

  it("is never kept by a cache: every run is new", async () => {
    expect((await stack()).headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("read limit", () => {
  const discover = async () => (await import("@/app/api/app/v1/discover/route")).GET();

  beforeEach(async () => {
    const limits = await import("@/lib/rate-limit");
    vi.mocked(limits.allowAddress).mockClear();
    vi.mocked(limits.allowUser).mockClear();
    lib.getHeavyRotation.mockResolvedValue(null);
    for (const shelf of [
      lib.newReleases,
      lib.topRatedOnMulo,
      lib.mostPlayedAlbums,
      lib.artistsToExplore,
      lib.getGlobalFeed,
    ]) {
      shelf.mockResolvedValue([]);
    }
    lib.getMyAlbumScores.mockResolvedValue(new Map());
  });

  it("turns a caller away past the limit, before reading anything", async () => {
    caller.limited = true;
    const response = await discover();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({ ok: false, error: TOO_MANY });
    expect(lib.newReleases).not.toHaveBeenCalled();
  });

  it("counts somebody signed out by their address", async () => {
    const { allowAddress, allowUser } = await import("@/lib/rate-limit");
    await discover();
    expect(allowAddress).toHaveBeenCalledWith("read");
    expect(allowUser).not.toHaveBeenCalled();
  });

  it("counts somebody signed in as themselves", async () => {
    signIn();
    const { allowAddress, allowUser } = await import("@/lib/rate-limit");
    await discover();
    expect(allowUser).toHaveBeenCalledWith("read", OTHER);
    expect(allowAddress).not.toHaveBeenCalled();
  });

  it("covers the Charts and The Stack too", async () => {
    caller.limited = true;
    const charts = (await import("@/app/api/app/v1/charts/route")).GET(request("charts"));
    expect((await charts).status).toBe(429);
    expect(lib.getChart).not.toHaveBeenCalled();

    signIn();
    const stack = (await import("@/app/api/app/v1/stack/route")).GET(request("stack"));
    expect((await stack).status).toBe(429);
    expect(lib.getStack).not.toHaveBeenCalled();
  });
});

describe("GET ratings", () => {
  const ratings = async (query = "") =>
    (await import("@/app/api/app/v1/ratings/route")).GET(request(`ratings${query}`));

  beforeEach(() => {
    signIn();
    lib.getOwnRatingCounts.mockResolvedValue({ album: 2, artist: 1, song: 0 });
    lib.getOwnAlbumRatings.mockResolvedValue([{ score: 9 }]);
    lib.getOwnArtistRatings.mockResolvedValue([{ score: 8 }]);
    lib.getOwnSongRatings.mockResolvedValue([{ score: 7 }]);
  });

  it("is your albums, newest first, by default", async () => {
    expect(await (await ratings()).json()).toEqual({
      counts: { album: 2, artist: 1, song: 0 },
      kind: "album",
      sort: "recent",
      items: [{ score: 9 }],
    });
    expect(lib.getOwnAlbumRatings).toHaveBeenCalledWith("recent");
  });

  it.each([
    ["artist", "highest", lib.getOwnArtistRatings, 8],
    ["song", "lowest", lib.getOwnSongRatings, 7],
  ] as const)("is your %ss in %s order when asked", async (kind, sort, read, score) => {
    const body = await (await ratings(`?kind=${kind}&sort=${sort}`)).json();
    expect(body).toMatchObject({ kind, sort, items: [{ score }] });
    expect(read).toHaveBeenCalledWith(sort);
    expect(lib.getOwnAlbumRatings).not.toHaveBeenCalled();
  });

  it("refuses a kind it doesn't know", async () => {
    expect((await ratings("?kind=podcast")).status).toBe(400);
  });
});

describe("GET people", () => {
  const people = async (query = "") =>
    (await import("@/app/api/app/v1/people/route")).GET(request(`people${query}`));

  beforeEach(() => {
    signIn();
    lib.getFollowingIds.mockResolvedValue(["p1"]);
  });

  it("pages through everyone, marking who you follow", async () => {
    lib.listProfiles.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({ id: `p${i}` })));
    const body = await (await people("?page=2")).json();
    expect(lib.listProfiles).toHaveBeenCalledWith({ offset: 50, size: 51 });
    expect(body.people).toHaveLength(50);
    expect(body).toMatchObject({ following: ["p1"], hasMore: true });
  });

  it("says when it's the last page", async () => {
    lib.listProfiles.mockResolvedValue([{ id: "p0" }]);
    const body = await (await people()).json();
    expect(lib.listProfiles).toHaveBeenCalledWith({ offset: 0, size: 51 });
    expect(body.hasMore).toBe(false);
  });
});

describe("GET users/[username]", () => {
  const PROFILE = {
    id: OTHER,
    username: "alex",
    display_name: null,
    avatar_url: null,
    bio: null,
    created_at: "2026-01-01T00:00:00Z",
  };
  const profile = async (username = "alex") =>
    (await import("@/app/api/app/v1/users/[username]/route")).GET(
      request(`users/${username}`),
      params({ username }),
    );

  beforeEach(() => {
    lib.getProfileByUsername.mockResolvedValue(PROFILE);
    lib.isHidden.mockResolvedValue(false);
    lib.getProfileStats.mockResolvedValue({
      followers: 1,
      following: 2,
      ratings: 3,
      averageScore: 7,
    });
    lib.getFollowState.mockResolvedValue({ signedIn: false, isSelf: false, isFollowing: false });
    lib.getUserFeed.mockResolvedValue([]);
    lib.getHighestRatedAlbums.mockResolvedValue([]);
  });

  it("answers the profile's core signed out, without their listening", async () => {
    lib.getUserFeed.mockResolvedValue([{ key: "r" }]);
    lib.getHighestRatedAlbums.mockResolvedValue([{ mbid: MBID }]);
    const body = await (await profile()).json();
    expect(body).toMatchObject({
      profile: PROFILE,
      stats: { ratings: 3 },
      follow: { isFollowing: false },
      recent: [],
      highest: [],
    });
    expect(lib.getUserFeed).not.toHaveBeenCalled();
    expect(lib.getHighestRatedAlbums).not.toHaveBeenCalled();
  });

  it("answers their latest ratings and top shelf to somebody signed in", async () => {
    signIn();
    lib.getUserFeed.mockResolvedValue([{ key: "r" }]);
    lib.getHighestRatedAlbums.mockResolvedValue([{ mbid: MBID }]);
    const body = await (await profile()).json();
    expect(body).toMatchObject({ recent: [{ key: "r" }], highest: [{ mbid: MBID }] });
    expect(lib.getUserFeed).toHaveBeenCalledWith(OTHER);
    expect(lib.getHighestRatedAlbums).toHaveBeenCalledWith(OTHER, 12);
  });

  it("refuses a token that doesn't verify", async () => {
    caller.token = "expired";
    expect((await profile()).status).toBe(401);
  });

  it("is 404 for nobody by that name", async () => {
    lib.getProfileByUsername.mockResolvedValue(null);
    expect((await profile()).status).toBe(404);
  });

  it("is 404 for somebody blocked either way round", async () => {
    lib.isHidden.mockResolvedValue(true);
    expect((await profile()).status).toBe(404);
    expect(lib.getUserFeed).not.toHaveBeenCalled();
  });

  it("is 404 for a username that can't exist, without looking", async () => {
    expect((await profile("no!")).status).toBe(404);
    expect(lib.getProfileByUsername).not.toHaveBeenCalled();
  });
});

describe("writes", () => {
  const writes: [string, () => Promise<Response>][] = [
    [
      "POST ratings",
      async () =>
        (await import("@/app/api/app/v1/ratings/route")).POST(
          json("ratings", "POST", { kind: "album", mbid: MBID, score: 8 }),
        ),
    ],
    [
      "DELETE ratings",
      async () =>
        (await import("@/app/api/app/v1/ratings/route")).DELETE(
          request(`ratings?kind=album&mbid=${MBID}`, { method: "DELETE" }),
        ),
    ],
    [
      "PUT reviews",
      async () =>
        (await import("@/app/api/app/v1/reviews/route")).PUT(
          json("reviews", "PUT", { kind: "album", mbid: MBID, review: "Great" }),
        ),
    ],
    [
      "PUT follows",
      async () =>
        (await import("@/app/api/app/v1/follows/[userId]/route")).PUT(
          json(`follows/${OTHER}`, "PUT", { following: true, username: "alex" }),
          params({ userId: OTHER }),
        ),
    ],
  ];

  it.each(writes)("%s needs a token, and touches nothing without one", async (_name, call) => {
    expect((await call()).status).toBe(401);
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });

  it.each(writes)("%s refuses a token that doesn't verify", async (_name, call) => {
    caller.token = "forged";
    expect((await call()).status).toBe(401);
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });

  it.each(writes)("%s answers with the action's own result", async (_name, call) => {
    signIn();
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("hands a score straight to rate", async () => {
    signIn();
    const { POST } = await import("@/app/api/app/v1/ratings/route");
    await POST(json("ratings", "POST", { kind: "song", mbid: OTHER, score: 7, releaseMbid: MBID }));
    expect(actions.rate).toHaveBeenCalledWith("song", OTHER, 7, MBID);
  });

  it("hands a removal straight to removeRating", async () => {
    signIn();
    const { DELETE } = await import("@/app/api/app/v1/ratings/route");
    await DELETE(
      request(`ratings?kind=song&mbid=${OTHER}&releaseMbid=${MBID}`, { method: "DELETE" }),
    );
    expect(actions.removeRating).toHaveBeenCalledWith("song", OTHER, MBID);
  });

  it("hands a review straight to saveReview", async () => {
    signIn();
    const { PUT } = await import("@/app/api/app/v1/reviews/route");
    await PUT(json("reviews", "PUT", { kind: "artist", mbid: OTHER, review: "" }));
    expect(actions.saveReview).toHaveBeenCalledWith("artist", OTHER, "");
  });

  it("hands a follow straight to setFollowing", async () => {
    signIn();
    const { PUT } = await import("@/app/api/app/v1/follows/[userId]/route");
    await PUT(
      json(`follows/${MBID}`, "PUT", { following: false, username: "sam" }),
      params({ userId: MBID }),
    );
    expect(actions.setFollowing).toHaveBeenCalledWith(MBID, "sam", false);
  });

  it("passes on the action's own refusal, in its words", async () => {
    signIn();
    actions.rate.mockResolvedValueOnce({ ok: false, error: "Scores run from 1 to 10." });
    const { POST } = await import("@/app/api/app/v1/ratings/route");
    const response = await POST(json("ratings", "POST", { kind: "album", mbid: MBID, score: 11 }));
    expect(await response.json()).toEqual({ ok: false, error: "Scores run from 1 to 10." });
  });

  it("refuses a body it can't read", async () => {
    signIn();
    const { POST } = await import("@/app/api/app/v1/ratings/route");
    const response = await POST(request("ratings", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(actions.rate).not.toHaveBeenCalled();
  });

  it("refuses a removal that doesn't say what", async () => {
    signIn();
    const { DELETE } = await import("@/app/api/app/v1/ratings/route");
    const response = await DELETE(request("ratings?kind=album", { method: "DELETE" }));
    expect(response.status).toBe(400);
    expect(actions.removeRating).not.toHaveBeenCalled();
  });
});

describe("POST auth/refresh", () => {
  const refresh = async (body: unknown) =>
    (await import("@/app/api/app/v1/auth/refresh/route")).POST(json("auth/refresh", "POST", body));

  it("trades a refresh token for a fresh session", async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    const response = await refresh({ refresh_token: "old" });
    expect(await response.json()).toEqual({ ok: true, session: SESSION });
    expect(auth.refreshSession).toHaveBeenCalledWith({ refresh_token: "old" });
  });

  it("is 401 when Supabase won't refresh it", async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid Refresh Token: Already Used" },
    });
    const response = await refresh({ refresh_token: "used" });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/log in again/);
  });

  it("refuses a body without a refresh token, without asking", async () => {
    expect((await refresh({})).status).toBe(400);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe("POST auth/logout", () => {
  const logout = async () => (await import("@/app/api/app/v1/auth/logout/route")).POST();

  it("needs a token", async () => {
    expect((await logout()).status).toBe(401);
    expect(auth.admin.signOut).not.toHaveBeenCalled();
  });

  it("ends this device's session only", async () => {
    signIn();
    expect(await (await logout()).json()).toEqual({ ok: true });
    expect(auth.admin.signOut).toHaveBeenCalledWith("good", "local");
  });

  it("still says ok when Supabase can't be reached: the app forgets the session anyway", async () => {
    signIn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.admin.signOut.mockRejectedValue(new Error("fetch failed"));
    expect(await (await logout()).json()).toEqual({ ok: true });
  });
});

describe("PUT me/profile", () => {
  const save = async (body: unknown) =>
    (await import("@/app/api/app/v1/me/profile/route")).PUT(json("me/profile", "PUT", body));

  it("needs a token", async () => {
    expect((await save({ username: "alex" })).status).toBe(401);
    expect(actions.saveProfile).not.toHaveBeenCalled();
  });

  it("hands the username and display name to the website's own action, and nothing else", async () => {
    signIn();
    actions.saveProfile.mockResolvedValue({ message: "Profile saved." });
    const response = await save({ username: "alex", display_name: "Alex" });
    expect(await response.json()).toEqual({ ok: true });
    const form = actions.saveProfile.mock.calls[0][1] as FormData;
    expect(form.get("username")).toBe("alex");
    expect(form.get("display_name")).toBe("Alex");
    // Leaving these out keeps the bio as it was and stops the action redirecting.
    expect(form.has("bio")).toBe(false);
    expect(form.has("next")).toBe(false);
  });

  it("passes on the action's own refusal, in its words", async () => {
    signIn();
    actions.saveProfile.mockResolvedValue({
      error: "That username is already taken. Try another.",
    });
    expect(await (await save({ username: "alex" })).json()).toEqual({
      ok: false,
      error: "That username is already taken. Try another.",
    });
  });

  it("refuses a body it can't read", async () => {
    signIn();
    expect((await save({ username: 7 })).status).toBe(400);
    expect(actions.saveProfile).not.toHaveBeenCalled();
  });
});
