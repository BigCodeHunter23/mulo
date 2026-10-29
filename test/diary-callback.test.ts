import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Last.fm's way back to MULO. Last.fm and the stored states are stand-ins. */

type Started = { userId: string; to: "web" | "app"; timeZone: string | null };

const lastfm = vi.hoisted(() => ({
  keys: { key: "KEY", secret: "SECRET" } as { key: string; secret: string } | null,
  takeConnectState: vi.fn<(state: string) => Promise<Started | null>>(async () => ({
    userId: "me",
    to: "web",
    timeZone: "Europe/London",
  })),
  sessionFor: vi.fn<(token: string, keys: unknown) => Promise<{ user: string; key: string }>>(
    async () => ({ user: "fran", key: "SESSION" }),
  ),
  saveConnection: vi.fn<(userId: string, account: unknown, zone: unknown) => Promise<void>>(
    async () => {},
  ),
}));

vi.mock("@/lib/diary/lastfm", async (original) => ({
  ...(await original<typeof import("@/lib/diary/lastfm")>()),
  lastfmKeys: () => lastfm.keys,
  takeConnectState: lastfm.takeConnectState,
  sessionFor: lastfm.sessionFor,
  saveConnection: lastfm.saveConnection,
}));

import { GET } from "@/app/diary/lastfm/callback/route";
import { connectCookie } from "@/lib/diary/lastfm";

const STATE = "s".repeat(32);
/** Back from Last.fm, from the browser that started (with its cookie) unless `cookie` says otherwise. */
const back = (query: string, cookie: string | null = connectCookie(STATE)) =>
  GET(
    new NextRequest(`https://mulo.test/diary/lastfm/callback?${query}`, {
      headers: cookie === null ? {} : { cookie: `mulo_lastfm=${cookie}` },
    }),
  );
const where = (res: Response) => res.headers.get("location");
const FAILED = "https://getmulo.com/diary?lastfm=failed";

beforeEach(() => {
  lastfm.keys = { key: "KEY", secret: "SECRET" };
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://getmulo.com");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /diary/lastfm/callback", () => {
  it("fails without a state or a token", async () => {
    expect(where(await back(`token=T`))).toBe(FAILED);
    expect(where(await back(`state=${STATE}`))).toBe(FAILED);
    expect(lastfm.takeConnectState).not.toHaveBeenCalled();
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });

  it("fails for a state that's used, expired or made up", async () => {
    lastfm.takeConnectState.mockResolvedValueOnce(null);
    expect(where(await back(`state=${STATE}&token=T`))).toBe(FAILED);
    expect(lastfm.sessionFor).not.toHaveBeenCalled();
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });

  it("fails when the website has no Last.fm keys", async () => {
    lastfm.keys = null;
    expect(where(await back(`state=${STATE}&token=T`))).toBe(FAILED);
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });

  it("saves the account for whoever started, and goes back to the diary", async () => {
    const res = await back(`state=${STATE}&token=T`);
    expect(where(res)).toBe("https://getmulo.com/diary?lastfm=connected");
    expect(lastfm.takeConnectState).toHaveBeenCalledWith(STATE);
    expect(lastfm.sessionFor).toHaveBeenCalledWith("T", { key: "KEY", secret: "SECRET" });
    expect(lastfm.saveConnection).toHaveBeenCalledWith(
      "me",
      { user: "fran", key: "SESSION" },
      "Europe/London",
    );
    // The cookie has done its job.
    expect(res.headers.get("set-cookie")).toMatch(/mulo_lastfm=;.*Path=\/diary\/lastfm/i);
  });

  it("goes back to the website's own address, never the one the request came to", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_BRANCH_URL", "mulo-git-diary.vercel.app");
    expect(where(await back(`state=${STATE}&token=T`))).toBe(
      "https://mulo-git-diary.vercel.app/diary?lastfm=connected",
    );
  });

  it("finishes a website connect only in the browser that started it", async () => {
    expect(where(await back(`state=${STATE}&token=T`, null))).toBe(FAILED);
    expect(where(await back(`state=${STATE}&token=T`, connectCookie("t".repeat(32))))).toBe(FAILED);
    // Saying it came from the app doesn't get round it.
    expect(where(await back(`state=${STATE}&token=T&to=app`, null))).toBe(FAILED);
    expect(lastfm.sessionFor).not.toHaveBeenCalled();
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });

  it("goes back to the app when the app started it, with no cookie to need", async () => {
    lastfm.takeConnectState.mockResolvedValueOnce({ userId: "me", to: "app", timeZone: null });
    expect(where(await back(`state=${STATE}&token=T&to=app`, null))).toBe(
      "mulo://diary/lastfm?ok=1",
    );
    expect(lastfm.saveConnection).toHaveBeenCalledWith("me", expect.anything(), null);
  });

  it("tells the app when it failed", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    lastfm.takeConnectState.mockResolvedValueOnce({ userId: "me", to: "app", timeZone: null });
    lastfm.sessionFor.mockRejectedValueOnce(new Error("Invalid token"));
    expect(where(await back(`state=${STATE}&token=T`))).toBe("mulo://diary/lastfm?error=1");
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });

  it("sends a failure back to the app when the app's state can't be read", async () => {
    lastfm.takeConnectState.mockResolvedValueOnce(null);
    expect(where(await back(`state=${STATE}&token=T&to=app`))).toBe("mulo://diary/lastfm?error=1");
    expect(where(await back(`state=${STATE}&to=app`))).toBe("mulo://diary/lastfm?error=1");
    lastfm.keys = null;
    expect(where(await back(`state=${STATE}&token=T&to=app`))).toBe("mulo://diary/lastfm?error=1");
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });

  it("ends in the right failure when the states can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    lastfm.takeConnectState.mockRejectedValueOnce(new Error("database down"));
    expect(where(await back(`state=${STATE}&token=T`))).toBe(FAILED);
    lastfm.takeConnectState.mockRejectedValueOnce(new Error("database down"));
    expect(where(await back(`state=${STATE}&token=T&to=app`))).toBe("mulo://diary/lastfm?error=1");
    vi.mocked(console.error).mockRestore();
  });

  it("leaves success and whose account it is to the state, whatever the address says", async () => {
    expect(where(await back(`state=${STATE}&token=T&to=app`))).toBe(
      "https://getmulo.com/diary?lastfm=connected",
    );
    expect(lastfm.saveConnection).toHaveBeenCalledWith(
      "me",
      { user: "fran", key: "SESSION" },
      "Europe/London",
    );

    lastfm.takeConnectState.mockResolvedValueOnce({ userId: "me", to: "app", timeZone: null });
    expect(where(await back(`state=${STATE}&token=T`))).toBe("mulo://diary/lastfm?ok=1");

    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    lastfm.sessionFor.mockRejectedValueOnce(new Error("Invalid token"));
    expect(where(await back(`state=${STATE}&token=T&to=app`))).toBe(FAILED);
  });

  it("never saves when Last.fm won't give a session", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    lastfm.sessionFor.mockRejectedValueOnce(new Error("Invalid token"));
    expect(where(await back(`state=${STATE}&token=T`))).toBe(FAILED);
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });
});
