import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The app API's Collection endpoints (stage 7): badges, milestones, GOAT,
 * Mixtape, the Gauntlet, rankings, taste, head to head and Home's extras.
 * The lib functions and actions are stand-ins, as in test/app-api.test.ts.
 */

const caller = vi.hoisted(() => ({
  token: null as string | null,
  user: null as { id: string; email: string | null } | null,
  limited: false,
}));

const lib = vi.hoisted(() => ({
  getProfileByUsername: vi.fn(),
  isHidden: vi.fn(),
  getCachedArtist: vi.fn(),
  getBadges: vi.fn(),
  getBadgeBoard: vi.fn(),
  getMilestoneCard: vi.fn(),
  getTopPicks: vi.fn(),
  getPickSuggestions: vi.fn(),
  getMixtape: vi.fn(),
  getGauntletRun: vi.fn(),
  getRanking: vi.fn(),
  getRatingStyle: vi.fn(),
  getHeadToHead: vi.fn(),
  getTasteTwin: vi.fn(),
  getReceipt: vi.fn(),
}));

const actions = vi.hoisted(() => ({ saveTopPicks: vi.fn(), saveRankOff: vi.fn() }));

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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/social", () => ({ getProfileByUsername: lib.getProfileByUsername }));
vi.mock("@/lib/blocks", () => ({ isHidden: lib.isHidden }));
vi.mock("@/lib/catalog", () => ({ getCachedArtist: lib.getCachedArtist }));
vi.mock("@/lib/badges", () => ({ getBadges: lib.getBadges, getBadgeBoard: lib.getBadgeBoard }));
vi.mock("@/lib/milestone-card", () => ({ getMilestoneCard: lib.getMilestoneCard }));
vi.mock("@/lib/top-picks", () => ({
  getTopPicks: lib.getTopPicks,
  getPickSuggestions: lib.getPickSuggestions,
}));
vi.mock("@/lib/mixtape", async (original) => ({
  // The month arithmetic is the real one; the read is a stand-in.
  ...(await original<typeof import("@/lib/mixtape")>()),
  getMixtape: lib.getMixtape,
}));
vi.mock("@/lib/gauntlet", () => ({
  getGauntletRun: lib.getGauntletRun,
  getRanking: lib.getRanking,
}));
vi.mock("@/lib/rating-style", () => ({ ENOUGH_TO_JUDGE: 8, getRatingStyle: lib.getRatingStyle }));
vi.mock("@/lib/head-to-head", () => ({ MINIMUM: 8, getHeadToHead: lib.getHeadToHead }));
vi.mock("@/lib/taste-twin", () => ({ getTasteTwin: lib.getTasteTwin }));
vi.mock("@/lib/receipts", async (original) => ({
  howLongAgo: (await original<typeof import("@/lib/receipts")>()).howLongAgo,
  getReceipt: lib.getReceipt,
}));
vi.mock("@/app/goat/actions", () => ({ saveTopPicks: actions.saveTopPicks }));
vi.mock("@/app/u/[username]/mixtape/actions", () => ({ saveRankOff: actions.saveRankOff }));

const { TOO_MANY } = await import("@/lib/rate-limit");

const MBID = "0383dadf-2a4e-4d10-a46a-e9e041da8eb3";
const ME = { id: "1f9df192-a621-4f54-8850-2c5373b7eac9", email: "me@example.com" };
const THEM = "5b11f4ce-a62d-471e-81fc-a69a8278c7da";
const PROFILE = {
  id: THEM,
  username: "alex",
  display_name: "Alex",
  avatar_url: null,
  bio: null,
  created_at: "2026-01-01T00:00:00Z",
};

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

function signIn(user: { id: string; email: string | null } = ME) {
  caller.token = "good";
  caller.user = user;
}

beforeEach(() => {
  caller.token = null;
  caller.user = null;
  caller.limited = false;
  for (const fn of Object.values(lib)) fn.mockReset();
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true });
  lib.getProfileByUsername.mockResolvedValue(PROFILE);
  lib.isHidden.mockResolvedValue(false);
  lib.getCachedArtist.mockResolvedValue({ mbid: MBID, name: "Radiohead" });
});

/** Every read about one person, which all find them the same way. */
const PERSON_READS: [string, (username: string) => Promise<Response>][] = [
  [
    "badges",
    async (u) =>
      (await import("@/app/api/app/v1/users/[username]/badges/route")).GET(
        request(`users/${u}/badges`),
        params({ username: u }),
      ),
  ],
  [
    "milestone",
    async (u) =>
      (await import("@/app/api/app/v1/users/[username]/milestone/[count]/route")).GET(
        request(`users/${u}/milestone/10`),
        params({ username: u, count: "10" }),
      ),
  ],
  [
    "mixtape",
    async (u) =>
      (await import("@/app/api/app/v1/users/[username]/mixtape/[month]/route")).GET(
        request(`users/${u}/mixtape/2026-03`),
        params({ username: u, month: "2026-03" }),
      ),
  ],
  [
    "ranks",
    async (u) =>
      (await import("@/app/api/app/v1/users/[username]/ranks/[artist]/route")).GET(
        request(`users/${u}/ranks/${MBID}`),
        params({ username: u, artist: MBID }),
      ),
  ],
  [
    "taste",
    async (u) =>
      (await import("@/app/api/app/v1/users/[username]/taste/route")).GET(
        request(`users/${u}/taste`),
        params({ username: u }),
      ),
  ],
  [
    "vs",
    async (u) =>
      (await import("@/app/api/app/v1/users/[username]/vs/route")).GET(
        request(`users/${u}/vs`),
        params({ username: u }),
      ),
  ],
];

describe("who may look", () => {
  it.each(PERSON_READS)("%s is 404 for nobody by that name", async (_name, read) => {
    signIn();
    lib.getProfileByUsername.mockResolvedValue(null);
    expect((await read("alex")).status).toBe(404);
  });

  it.each(PERSON_READS)("%s is 404 for somebody blocked either way round", async (_name, read) => {
    signIn();
    lib.isHidden.mockResolvedValue(true);
    expect((await read("alex")).status).toBe(404);
  });

  it.each(PERSON_READS)("%s is 404 for a username that can't exist", async (_name, read) => {
    signIn();
    expect((await read("no!")).status).toBe(404);
    expect(lib.getProfileByUsername).not.toHaveBeenCalled();
  });

  it.each(PERSON_READS)("%s is limited like the other reads", async (_name, read) => {
    signIn();
    caller.limited = true;
    const response = await read("alex");
    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe(TOO_MANY);
  });

  it.each(PERSON_READS)("%s refuses a token that doesn't verify", async (_name, read) => {
    caller.token = "expired";
    expect((await read("alex")).status).toBe(401);
  });
});

describe("GET users/[username]/badges", () => {
  const BADGE = { slug: "first-spin", name: "First spin", description: "Rated your first album" };
  const BOARD = { earned: 1, total: 40, groups: [], ladders: [] };
  const badges = async () =>
    (await import("@/app/api/app/v1/users/[username]/badges/route")).GET(
      request("users/alex/badges"),
      params({ username: "alex" }),
    );

  beforeEach(() => {
    lib.getBadges.mockResolvedValue([BADGE]);
    lib.getBadgeBoard.mockResolvedValue(BOARD);
  });

  it("answers the row and the board, to anyone, as the page does", async () => {
    const body = await (await badges()).json();
    expect(body).toEqual({ profile: PROFILE, isSelf: false, badges: [BADGE], board: BOARD });
    expect(lib.getBadges).toHaveBeenCalledWith(THEM);
    expect(lib.getBadgeBoard).toHaveBeenCalledWith(THEM);
  });

  it("says when they're your own", async () => {
    signIn({ id: THEM, email: null });
    expect((await (await badges()).json()).isSelf).toBe(true);
  });
});

describe("GET users/[username]/milestone/[count]", () => {
  const CARD = {
    count: 10,
    profile: { id: THEM, username: "alex", name: "Alex", avatarUrl: null },
    average: 7.2,
    top: [],
  };
  const milestone = async (count: string) =>
    (await import("@/app/api/app/v1/users/[username]/milestone/[count]/route")).GET(
      request(`users/alex/milestone/${count}`),
      params({ username: "alex", count }),
    );

  it("answers the card, to anyone", async () => {
    lib.getMilestoneCard.mockResolvedValue(CARD);
    expect(await (await milestone("10")).json()).toEqual({ card: CARD, isSelf: false });
    expect(lib.getMilestoneCard).toHaveBeenCalledWith("alex", 10);
  });

  it.each(["1e1", " 10", "0x0a"])("is 404 for %s, without looking", async (count) => {
    lib.getMilestoneCard.mockResolvedValue(CARD);
    expect((await milestone(count)).status).toBe(404);
    expect(lib.getMilestoneCard).not.toHaveBeenCalled();
  });

  it("is 404 for a count that isn't one, or that they haven't reached", async () => {
    lib.getMilestoneCard.mockResolvedValue(null);
    const response = await milestone("11");
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("We couldn't find that milestone.");
  });
});

describe("GET users/[username]/mixtape/[month]", () => {
  const TAPE = { month: "2026-03", label: "March 2026", albums: 2 };
  const mixtape = async (month: string) =>
    (await import("@/app/api/app/v1/users/[username]/mixtape/[month]/route")).GET(
      request(`users/alex/mixtape/${month}`),
      params({ username: "alex", month }),
    );

  beforeEach(() => lib.getMixtape.mockResolvedValue(TAPE));

  it("answers the month with the months either side", async () => {
    const body = await (await mixtape("2026-03")).json();
    expect(body).toEqual({
      profile: PROFILE,
      isSelf: false,
      mixtape: TAPE,
      previous: "2026-02",
      next: "2026-04",
    });
    expect(lib.getMixtape).toHaveBeenCalledWith(THEM, "2026-03");
  });

  it("has no next month after this one", async () => {
    const { currentMonth } = await import("@/lib/mixtape");
    expect((await (await mixtape(currentMonth())).json()).next).toBeNull();
  });

  it.each(["2026-13", "march", "2999-01"])("is 404 for %s, without looking", async (month) => {
    const response = await mixtape(month);
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("We couldn't find that month.");
    expect(lib.getMixtape).not.toHaveBeenCalled();
  });
});

describe("PUT mixtape/[month]/rank-off", () => {
  const rankOff = async (body: unknown, month = "2026-03") =>
    (await import("@/app/api/app/v1/mixtape/[month]/rank-off/route")).PUT(
      json(`mixtape/${month}/rank-off`, "PUT", body),
      params({ month }),
    );

  it("saves the winner, as the rank-off's last round does", async () => {
    signIn();
    const response = await rankOff({ kind: "album", mbid: MBID });
    expect(await response.json()).toEqual({ ok: true });
    expect(actions.saveRankOff).toHaveBeenCalledWith("2026-03", "album", MBID);
  });

  it("answers with the action's own words", async () => {
    signIn();
    actions.saveRankOff.mockResolvedValue({
      ok: false,
      error: "Your top scores changed. Refresh and try again.",
    });
    expect((await (await rankOff({ kind: "song", mbid: MBID })).json()).error).toBe(
      "Your top scores changed. Refresh and try again.",
    );
  });

  it("needs somebody signed in", async () => {
    expect((await rankOff({ kind: "album", mbid: MBID })).status).toBe(401);
    expect(actions.saveRankOff).not.toHaveBeenCalled();
  });

  it("refuses a body it can't read", async () => {
    signIn();
    expect((await rankOff({ kind: "artist", mbid: MBID })).status).toBe(400);
    expect(actions.saveRankOff).not.toHaveBeenCalled();
  });
});

describe("GET users/[username]/ranks/[artist]", () => {
  const RANKED = [{ mbid: MBID, title: "Kid A", year: "2000", cover: null, score: 10 }];
  const ranks = async (artist = MBID) =>
    (await import("@/app/api/app/v1/users/[username]/ranks/[artist]/route")).GET(
      request(`users/alex/ranks/${artist}`),
      params({ username: "alex", artist }),
    );

  it("answers their ranking with the artist's name", async () => {
    lib.getRanking.mockResolvedValue({ ranked: RANKED, total: 9 });
    expect(await (await ranks()).json()).toEqual({
      profile: PROFILE,
      isSelf: false,
      artist: { mbid: MBID, name: "Radiohead" },
      ranked: RANKED,
      total: 9,
    });
    expect(lib.getRanking).toHaveBeenCalledWith(THEM, MBID);
  });

  it("is 404 for an artist that isn't there", async () => {
    lib.getCachedArtist.mockResolvedValue(null);
    expect((await ranks()).status).toBe(404);
  });

  it("is 404 for an id that can't be one, without looking", async () => {
    expect((await ranks("nope")).status).toBe(404);
    expect(lib.getCachedArtist).not.toHaveBeenCalled();
  });
});

describe("GET artists/[mbid]/gauntlet", () => {
  const CARD = { mbid: MBID, title: "Pablo Honey", reason: "Album 1 of 9" };
  const gauntlet = async (mbid = MBID) =>
    (await import("@/app/api/app/v1/artists/[mbid]/gauntlet/route")).GET(
      request(`artists/${mbid}/gauntlet`),
      params({ mbid }),
    );

  it("answers what's left of the run, oldest first", async () => {
    signIn();
    lib.getGauntletRun.mockResolvedValue({ run: [CARD], total: 9 });
    expect(await (await gauntlet()).json()).toEqual({
      artist: { mbid: MBID, name: "Radiohead" },
      run: [CARD],
      total: 9,
    });
    expect(lib.getGauntletRun).toHaveBeenCalledWith(ME.id, MBID, "Radiohead");
  });

  it("needs somebody signed in", async () => {
    expect((await gauntlet()).status).toBe(401);
  });

  it("is 404 for an artist that isn't there", async () => {
    signIn();
    lib.getCachedArtist.mockResolvedValue(null);
    expect((await gauntlet()).status).toBe(404);
  });

  it("is 404 for an id that can't be one, without looking", async () => {
    signIn();
    expect((await gauntlet("nope")).status).toBe(404);
    expect(lib.getCachedArtist).not.toHaveBeenCalled();
  });

  it("is limited like the other reads", async () => {
    signIn();
    caller.limited = true;
    expect((await gauntlet()).status).toBe(429);
    expect(lib.getGauntletRun).not.toHaveBeenCalled();
  });
});

describe("goat", () => {
  const PICK = { mbid: MBID, title: "Radiohead", subtitle: null, image: null };
  const SUGGESTIONS = { source: "rated", picks: [{ ...PICK, score: 10 }] };
  const read = async (query = "") =>
    (await import("@/app/api/app/v1/goat/route")).GET(request(`goat${query}`));
  const save = async (body: unknown) =>
    (await import("@/app/api/app/v1/goat/route")).PUT(json("goat", "PUT", body));

  beforeEach(() => {
    lib.getTopPicks.mockResolvedValue([PICK]);
    lib.getPickSuggestions.mockResolvedValue(SUGGESTIONS);
  });

  it("answers your artists by default", async () => {
    signIn();
    expect(await (await read()).json()).toEqual({
      kind: "artist",
      picks: [PICK],
      suggestions: SUGGESTIONS,
    });
    expect(lib.getTopPicks).toHaveBeenCalledWith(ME.id, "artist");
  });

  it("answers your albums when asked", async () => {
    signIn();
    expect((await (await read("?kind=album")).json()).kind).toBe("album");
    expect(lib.getPickSuggestions).toHaveBeenCalledWith(ME.id, "album");
  });

  it("refuses a kind it doesn't know", async () => {
    signIn();
    expect((await read("?kind=song")).status).toBe(400);
  });

  it("needs somebody signed in to read or save", async () => {
    expect((await read()).status).toBe(401);
    expect((await save({ kind: "artist", mbids: [] })).status).toBe(401);
  });

  it("is limited like the other reads", async () => {
    signIn();
    caller.limited = true;
    expect((await read()).status).toBe(429);
  });

  it("saves the whole list, as the builder does after every change", async () => {
    signIn();
    expect(await (await save({ kind: "album", mbids: [MBID] })).json()).toEqual({ ok: true });
    expect(actions.saveTopPicks).toHaveBeenCalledWith("album", [MBID]);
  });

  it("answers a failed save with the action's own words", async () => {
    signIn();
    actions.saveTopPicks.mockResolvedValue({
      ok: false,
      error: "Couldn't save your list. Please try again.",
    });
    expect((await (await save({ kind: "artist", mbids: [] })).json()).error).toBe(
      "Couldn't save your list. Please try again.",
    );
  });

  it("refuses a body it can't read", async () => {
    signIn();
    expect((await save({ kind: "artist", mbids: "x" })).status).toBe(400);
    expect((await save({ kind: "artist", mbids: Array(51).fill(MBID) })).status).toBe(400);
    expect((await save({ kind: "artist", mbids: ["x".repeat(65)] })).status).toBe(400);
    expect(actions.saveTopPicks).not.toHaveBeenCalled();
  });
});

describe("GET users/[username]/taste", () => {
  const taste = async () =>
    (await import("@/app/api/app/v1/users/[username]/taste/route")).GET(
      request("users/alex/taste"),
      params({ username: "alex" }),
    );

  it("answers how they rate, to anyone", async () => {
    const STYLE = { compared: 20, yours: 7.1, everyone: 6.5, gap: 0.6 };
    lib.getRatingStyle.mockResolvedValue(STYLE);
    expect(await (await taste()).json()).toEqual({
      profile: PROFILE,
      isSelf: false,
      style: STYLE,
      enough: 8,
    });
    expect(lib.getRatingStyle).toHaveBeenCalledWith(THEM);
  });

  it("says how many it takes when there isn't enough yet", async () => {
    lib.getRatingStyle.mockResolvedValue(null);
    expect(await (await taste()).json()).toMatchObject({ style: null, enough: 8 });
  });
});

describe("GET users/[username]/vs", () => {
  const vs = async () =>
    (await import("@/app/api/app/v1/users/[username]/vs/route")).GET(
      request("users/alex/vs"),
      params({ username: "alex" }),
    );

  it("answers you against them", async () => {
    signIn();
    const HEAD = { ready: true, percent: 74, shared: 30 };
    lib.getHeadToHead.mockResolvedValue(HEAD);
    expect(await (await vs()).json()).toEqual({ profile: PROFILE, head: HEAD, minimum: 8 });
    expect(lib.getHeadToHead).toHaveBeenCalledWith(THEM);
  });

  it("needs somebody signed in", async () => {
    expect((await vs()).status).toBe(401);
  });

  it("is 404 against yourself", async () => {
    signIn({ id: THEM, email: null });
    expect((await vs()).status).toBe(404);
    expect(lib.getHeadToHead).not.toHaveBeenCalled();
  });
});

describe("GET me/home", () => {
  const TWIN = { id: THEM, username: "alex", percent: 91 };
  const RECEIPT = {
    mbid: MBID,
    title: "Kid A",
    artist: "Radiohead",
    cover_art_url: null,
    score: 9,
    rated_at: "2024-01-01T00:00:00Z",
    everyone: 8.4,
  };
  const home = async () => (await import("@/app/api/app/v1/me/home/route")).GET();

  it("answers the twin and the Receipt with how long ago", async () => {
    signIn();
    lib.getTasteTwin.mockResolvedValue(TWIN);
    lib.getReceipt.mockResolvedValue(RECEIPT);
    const body = await (await home()).json();
    expect(body.twin).toEqual(TWIN);
    expect(body.receipt).toMatchObject(RECEIPT);
    expect(body.receipt.howLongAgo).toMatch(/years? ago$/);
    expect(lib.getTasteTwin).toHaveBeenCalledWith(ME.id);
    expect(lib.getReceipt).toHaveBeenCalledWith(ME.id);
  });

  it("answers nulls when there's neither", async () => {
    signIn();
    lib.getTasteTwin.mockResolvedValue(null);
    lib.getReceipt.mockResolvedValue(null);
    expect(await (await home()).json()).toEqual({ twin: null, receipt: null });
  });

  it("leaves out whichever can't be worked out, rather than failing Home", async () => {
    signIn();
    lib.getTasteTwin.mockRejectedValue(new Error("down"));
    lib.getReceipt.mockResolvedValue(RECEIPT);
    const response = await home();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.twin).toBeNull();
    expect(body.receipt).toMatchObject(RECEIPT);
  });

  it("needs somebody signed in", async () => {
    expect((await home()).status).toBe(401);
  });

  it("is limited like the other reads", async () => {
    signIn();
    caller.limited = true;
    expect((await home()).status).toBe(429);
  });
});
