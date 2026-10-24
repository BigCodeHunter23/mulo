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

/** What Supabase answers a log-in or sign-up. */
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
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
  searchCatalog: vi.fn(),
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
vi.mock("@/lib/discover", () => ({ similarArtists: lib.similarArtists }));
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
  for (const fn of Object.values(lib)) fn.mockReset();
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
