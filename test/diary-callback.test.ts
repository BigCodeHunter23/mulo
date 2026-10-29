import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Last.fm's way back to MULO. Last.fm and the stored states are stand-ins. */

const lastfm = vi.hoisted(() => ({
  keys: { key: "KEY", secret: "SECRET" } as { key: string; secret: string } | null,
  takeConnectState: vi.fn<(state: string) => Promise<{ userId: string; to: "web" | "app" } | null>>(
    async () => ({ userId: "me", to: "web" }),
  ),
  sessionFor: vi.fn<(token: string, keys: unknown) => Promise<{ user: string; key: string }>>(
    async () => ({ user: "fran", key: "SESSION" }),
  ),
  saveConnection: vi.fn<(userId: string, session: unknown) => Promise<void>>(async () => {}),
}));

vi.mock("@/lib/diary/lastfm", () => ({
  lastfmKeys: () => lastfm.keys,
  takeConnectState: lastfm.takeConnectState,
  sessionFor: lastfm.sessionFor,
  saveConnection: lastfm.saveConnection,
}));

import { GET } from "@/app/diary/lastfm/callback/route";

const STATE = "s".repeat(32);
const back = (query: string) =>
  GET(new NextRequest(`https://mulo.test/diary/lastfm/callback?${query}`));
const where = (res: Response) => res.headers.get("location");

beforeEach(() => {
  lastfm.keys = { key: "KEY", secret: "SECRET" };
  vi.clearAllMocks();
});

describe("GET /diary/lastfm/callback", () => {
  it("fails without a state or a token", async () => {
    expect(where(await back(`token=T`))).toBe("https://mulo.test/diary?lastfm=failed");
    expect(where(await back(`state=${STATE}`))).toBe("https://mulo.test/diary?lastfm=failed");
    expect(lastfm.takeConnectState).not.toHaveBeenCalled();
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });

  it("fails for a state that's used, expired or made up", async () => {
    lastfm.takeConnectState.mockResolvedValueOnce(null);
    expect(where(await back(`state=${STATE}&token=T`))).toBe(
      "https://mulo.test/diary?lastfm=failed",
    );
    expect(lastfm.sessionFor).not.toHaveBeenCalled();
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });

  it("fails when the website has no Last.fm keys", async () => {
    lastfm.keys = null;
    expect(where(await back(`state=${STATE}&token=T`))).toBe(
      "https://mulo.test/diary?lastfm=failed",
    );
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });

  it("saves the account for whoever started, and goes back to the diary", async () => {
    const res = await back(`state=${STATE}&token=T`);
    expect(where(res)).toBe("https://mulo.test/diary?lastfm=connected");
    expect(lastfm.takeConnectState).toHaveBeenCalledWith(STATE);
    expect(lastfm.sessionFor).toHaveBeenCalledWith("T", { key: "KEY", secret: "SECRET" });
    expect(lastfm.saveConnection).toHaveBeenCalledWith("me", { user: "fran", key: "SESSION" });
  });

  it("goes back to the app when the app started it", async () => {
    lastfm.takeConnectState.mockResolvedValueOnce({ userId: "me", to: "app" });
    expect(where(await back(`state=${STATE}&token=T`))).toBe("mulo://diary/lastfm?ok=1");
  });

  it("tells the app when it failed", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    lastfm.takeConnectState.mockResolvedValueOnce({ userId: "me", to: "app" });
    lastfm.sessionFor.mockRejectedValueOnce(new Error("Invalid token"));
    expect(where(await back(`state=${STATE}&token=T`))).toBe("mulo://diary/lastfm?error=1");
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });

  it("never saves when Last.fm won't give a session", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    lastfm.sessionFor.mockRejectedValueOnce(new Error("Invalid token"));
    expect(where(await back(`state=${STATE}&token=T`))).toBe(
      "https://mulo.test/diary?lastfm=failed",
    );
    expect(lastfm.saveConnection).not.toHaveBeenCalled();
  });
});
