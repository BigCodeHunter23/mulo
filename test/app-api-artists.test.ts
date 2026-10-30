import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The app API's endpoints for following artists and new releases. The lib
 * functions and actions are stand-ins, as in test/app-api.test.ts.
 */

const caller = vi.hoisted(() => ({
  token: null as string | null,
  user: null as { id: string; email: string | null } | null,
  limited: false,
}));

const lib = vi.hoisted(() => ({
  setArtistFollowing: vi.fn(),
  followArtists: vi.fn(),
  listFollowedArtists: vi.fn(),
  getArtistSuggestions: vi.fn(),
  getNewReleases: vi.fn(),
  visibleProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  bearerToken: vi.fn(async () => caller.token),
  getCurrentUser: vi.fn(async () => caller.user),
  createClient: vi.fn(async () => ({})),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  allowAddress: vi.fn(async () => !caller.limited),
  allowUser: vi.fn(async () => !caller.limited),
}));
vi.mock("@/app/artist/[mbid]/actions", () => ({
  setArtistFollowing: lib.setArtistFollowing,
  followArtists: lib.followArtists,
}));
vi.mock("@/lib/artist-follows", () => ({
  listFollowedArtists: lib.listFollowedArtists,
  getArtistSuggestions: lib.getArtistSuggestions,
}));
vi.mock("@/lib/releases/shelf", () => ({ getNewReleases: lib.getNewReleases }));
vi.mock("@/lib/app-profile", () => ({
  PERSON_NOT_FOUND: "We couldn't find that person.",
  visibleProfile: lib.visibleProfile,
}));

const ME = { id: "1f9df192-a621-4f54-8850-2c5373b7eac9", email: "me@example.com" };
const THEM = "5b11f4ce-a62d-471e-81fc-a69a8278c7da";
const TYLER = "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6";
const ARTIST = { mbid: TYLER, name: "Tyler, the Creator", image_url: null };

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`https://mulo.test/api/app/v1/${path}`, init);
}
const json = (path: string, method: string, body: unknown) =>
  request(path, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

function signIn() {
  caller.token = "good";
  caller.user = ME;
}

beforeEach(() => {
  caller.token = null;
  caller.user = null;
  caller.limited = false;
  for (const fn of Object.values(lib)) fn.mockReset();
  lib.visibleProfile.mockResolvedValue({ id: THEM, username: "alex" });
});

describe("artists/[mbid]/follow", () => {
  const route = () => import("@/app/api/app/v1/artists/[mbid]/follow/route");

  it("follows with POST and unfollows with DELETE, answering the action's words", async () => {
    signIn();
    lib.setArtistFollowing.mockResolvedValue({ ok: true, first: true });
    const followed = await (
      await route()
    ).POST(request(`artists/${TYLER}/follow`), params({ mbid: TYLER }));
    expect(await followed.json()).toEqual({ ok: true, first: true });
    expect(lib.setArtistFollowing).toHaveBeenCalledWith(TYLER, true);

    lib.setArtistFollowing.mockResolvedValue({ ok: true });
    await (await route()).DELETE(request(`artists/${TYLER}/follow`), params({ mbid: TYLER }));
    expect(lib.setArtistFollowing).toHaveBeenLastCalledWith(TYLER, false);
  });

  it("needs somebody signed in", async () => {
    const res = await (
      await route()
    ).POST(request(`artists/${TYLER}/follow`), params({ mbid: TYLER }));
    expect(res.status).toBe(401);
    expect(lib.setArtistFollowing).not.toHaveBeenCalled();
  });
});

describe("GET users/[username]/artists", () => {
  const read = async (query = "", username = "alex") =>
    (await import("@/app/api/app/v1/users/[username]/artists/route")).GET(
      request(`users/${username}/artists${query}`),
      params({ username }),
    );

  it("answers a page of the artists they follow, and whether there's more", async () => {
    signIn();
    lib.listFollowedArtists.mockResolvedValue(Array.from({ length: 51 }, () => ARTIST));
    const body = await (await read("?page=2")).json();
    expect(body.artists).toHaveLength(50);
    expect(body.hasMore).toBe(true);
    expect(lib.listFollowedArtists).toHaveBeenCalledWith(THEM, { offset: 50, size: 51 });
  });

  it("is 401 signed out, and 404 for somebody hidden or not there", async () => {
    expect((await read()).status).toBe(401);
    signIn();
    lib.visibleProfile.mockResolvedValue(null);
    expect((await read()).status).toBe(404);
  });
});

describe("GET me/new-releases", () => {
  const read = async () => (await import("@/app/api/app/v1/me/new-releases/route")).GET();

  it("answers the shelf", async () => {
    signIn();
    const release = { mbid: "m1", when: "Today", soon: false };
    lib.getNewReleases.mockResolvedValue([release]);
    expect(await (await read()).json()).toEqual({ releases: [release] });
    expect(lib.getNewReleases).toHaveBeenCalledWith(ME.id);
  });

  it("is 401 signed out, and 429 over the limit", async () => {
    expect((await read()).status).toBe(401);
    signIn();
    caller.limited = true;
    expect((await read()).status).toBe(429);
  });
});

describe("GET me/artist-suggestions", () => {
  it("answers the artists you rate highest", async () => {
    signIn();
    lib.getArtistSuggestions.mockResolvedValue([ARTIST]);
    const res = await (await import("@/app/api/app/v1/me/artist-suggestions/route")).GET();
    expect(await res.json()).toEqual({ artists: [ARTIST] });
  });
});

describe("POST me/artist-follows", () => {
  const post = async (body: unknown) =>
    (await import("@/app/api/app/v1/me/artist-follows/route")).POST(
      json("me/artist-follows", "POST", body),
    );

  it("follows the ones sent", async () => {
    signIn();
    lib.followArtists.mockResolvedValue({ ok: true });
    expect(await (await post({ mbids: [TYLER] })).json()).toEqual({ ok: true });
    expect(lib.followArtists).toHaveBeenCalledWith([TYLER]);
  });

  it("takes one to twelve, and needs somebody signed in", async () => {
    expect((await post({ mbids: [TYLER] })).status).toBe(401);
    signIn();
    expect((await post({ mbids: [] })).status).toBe(400);
    expect((await post({ mbids: Array.from({ length: 13 }, () => TYLER) })).status).toBe(400);
    expect(lib.followArtists).not.toHaveBeenCalled();
  });
});
