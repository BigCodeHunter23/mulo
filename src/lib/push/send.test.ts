import { describe, expect, it, vi } from "vitest";
import { sendPushes, type SendDeps } from "@/lib/push/send";
import type { ExpoMessage } from "@/lib/push/expo";
import type { LogEntry } from "@/lib/push/store";
import { ALL_ON } from "@/lib/push/who";
import type { PushMessage } from "@/lib/push/messages";

vi.mock("@/lib/push/store", () => ({
  logKey: (e: { userId: string; kind: string; key: string }) => `${e.userId}|${e.kind}|${e.key}`,
}));
vi.mock("@/lib/push/expo", () => ({}));

const msg = (userId: string, kind: PushMessage["kind"] = "follow"): PushMessage => ({
  userId,
  kind,
  key: `k-${userId}`,
  title: "Sam followed you",
  url: "/u/sam",
});

function deps(over: Partial<SendDeps> = {}): SendDeps {
  return {
    readSwitches: vi.fn(async () => new Map()),
    claimPushes: vi.fn(
      async (entries: LogEntry[]) => new Set(entries.map((e) => `${e.userId}|${e.kind}|${e.key}`)),
    ),
    devicesOf: vi.fn(async (ids: string[]) => ids.map((id) => ({ token: `T-${id}`, user_id: id }))),
    postToExpo: vi.fn(async (messages: ExpoMessage[]) =>
      messages.map((_, i) => ({ status: "ok" as const, id: `id${i}` })),
    ),
    saveTickets: vi.fn(async () => {}),
    dropTokens: vi.fn(async () => {}),
    ...over,
  };
}

describe("sendPushes", () => {
  it("sends to every phone of each person, with the page to open", async () => {
    const d = deps();
    expect(await sendPushes([msg("a")], d)).toBe(1);
    expect(d.postToExpo).toHaveBeenCalledWith([
      { to: "T-a", title: "Sam followed you", data: { url: "/u/sam" }, sound: "default" },
    ]);
    expect(d.saveTickets).toHaveBeenCalledWith({ userId: "a", kind: "follow", key: "k-a" }, [
      { id: "id0", token: "T-a" },
    ]);
  });

  it("skips anyone who switched that kind off", async () => {
    const d = deps({
      readSwitches: vi.fn(async () => new Map([["a", { ...ALL_ON, follows: false }]])),
    });
    expect(await sendPushes([msg("a")], d)).toBe(0);
    expect(d.claimPushes).not.toHaveBeenCalled();
  });

  it("never sends what the log says went already", async () => {
    const d = deps({ claimPushes: vi.fn(async () => new Set<string>()) });
    expect(await sendPushes([msg("a")], d)).toBe(0);
    expect(d.postToExpo).not.toHaveBeenCalled();
  });

  it("drops a phone Expo calls unregistered", async () => {
    const d = deps({
      postToExpo: vi.fn(async () => [
        { status: "error" as const, details: { error: "DeviceNotRegistered" } },
      ]),
    });
    await sendPushes([msg("a")], d);
    expect(d.dropTokens).toHaveBeenCalledWith(["T-a"]);
  });

  it("never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      readSwitches: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    expect(await sendPushes([msg("a")], d)).toBe(0);
  });
});
