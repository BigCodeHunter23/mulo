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

  it("keeps the ok phone's ticket and drops the other for one person with two phones", async () => {
    const d = deps({
      devicesOf: vi.fn(async () => [
        { token: "P1", user_id: "a" },
        { token: "P2", user_id: "a" },
      ]),
      postToExpo: vi.fn(async () => [
        { status: "ok" as const, id: "id0" },
        { status: "error" as const, details: { error: "DeviceNotRegistered" } },
      ]),
    });
    expect(await sendPushes([msg("a")], d)).toBe(2);
    expect(d.saveTickets).toHaveBeenCalledTimes(1);
    expect(d.saveTickets).toHaveBeenCalledWith({ userId: "a", kind: "follow", key: "k-a" }, [
      { id: "id0", token: "P1" },
    ]);
    expect(d.dropTokens).toHaveBeenCalledWith(["P2"]);
  });

  it("saves and drops nothing for a ticket from a refused batch", async () => {
    const d = deps({
      postToExpo: vi.fn(async () => [undefined]) as unknown as SendDeps["postToExpo"],
    });
    await sendPushes([msg("a")], d);
    expect(d.saveTickets).not.toHaveBeenCalled();
    expect(d.dropTokens).toHaveBeenCalledWith([]);
  });

  it("passes the body when there is one and leaves it out when there isn't", async () => {
    const d = deps();
    await sendPushes([{ ...msg("a"), body: "Nice taste" }, msg("b")], d);
    const [sent] = vi.mocked(d.postToExpo).mock.calls[0]!;
    expect(sent[0]).toMatchObject({ body: "Nice taste" });
    expect(sent[1]).not.toHaveProperty("body");
  });

  it("logs only Expo's error code, never its message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      postToExpo: vi.fn(async () => [
        {
          status: "error" as const,
          message: "ExponentPushToken[secret] is not valid",
          details: { error: "InvalidCredentials" },
        },
        { status: "error" as const, message: "ExponentPushToken[other] went wrong" },
      ]),
    });
    await sendPushes([msg("a"), msg("b")], d);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("InvalidCredentials");
    expect(logged).toContain("unknown");
    expect(logged).not.toContain("ExponentPushToken");
  });

  it("drops gone phones before saving tickets, and a failed save doesn't stop the others", async () => {
    const order: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      devicesOf: vi.fn(async () => [
        { token: "A", user_id: "a" },
        { token: "B", user_id: "b" },
        { token: "C", user_id: "c" },
      ]),
      postToExpo: vi.fn(async () => [
        { status: "ok" as const, id: "id-a" },
        { status: "ok" as const, id: "id-b" },
        { status: "error" as const, details: { error: "DeviceNotRegistered" } },
      ]),
      dropTokens: vi.fn(async () => {
        order.push("drop");
      }),
      saveTickets: vi.fn(async (entry: LogEntry) => {
        order.push(`save-${entry.userId}`);
        if (entry.userId === "a") throw new Error("db down");
      }),
    });
    expect(await sendPushes([msg("a"), msg("b"), msg("c")], d)).toBe(3);
    expect(order).toEqual(["drop", "save-a", "save-b"]);
    expect(log).toHaveBeenCalledWith("[push] saving a push's tickets failed:", expect.any(Error));
  });

  it("claims nothing for somebody with no phone", async () => {
    const d = deps({ devicesOf: vi.fn(async () => []) });
    expect(await sendPushes([msg("a")], d)).toBe(0);
    expect(d.claimPushes).not.toHaveBeenCalled();
  });

  it("claims and sends in batches of up to 100 phones", async () => {
    const d = deps();
    const people = Array.from({ length: 250 }, (_, i) => msg(`u${i}`));
    expect(await sendPushes(people, d)).toBe(250);
    expect(vi.mocked(d.claimPushes).mock.calls.map(([batch]) => batch.length)).toEqual([
      100, 100, 50,
    ]);
    expect(d.postToExpo).toHaveBeenCalledTimes(3);
  });

  it("claims no more batches once the deadline has passed, leaving them for the next run", async () => {
    const deadline = Date.now() + 60_000;
    const d = deps({
      postToExpo: vi.fn(async (messages: ExpoMessage[]) => {
        // The first batch takes the rest of the run's time.
        vi.spyOn(Date, "now").mockReturnValue(deadline + 1);
        return messages.map((_, i) => ({ status: "ok" as const, id: `id${i}` }));
      }),
    });
    const people = Array.from({ length: 250 }, (_, i) => msg(`u${i}`));
    expect(await sendPushes(people, d, { deadline })).toBe(100);
    expect(d.claimPushes).toHaveBeenCalledTimes(1);
  });

  it("claims nothing at all when the deadline has already passed", async () => {
    const d = deps();
    expect(await sendPushes([msg("a")], d, { deadline: 0 })).toBe(0);
    expect(d.claimPushes).not.toHaveBeenCalled();
  });

  it("sends every batch without a deadline, however long it takes (follows and loves)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Number.MAX_SAFE_INTEGER);
    const d = deps();
    const people = Array.from({ length: 150 }, (_, i) => msg(`u${i}`));
    expect(await sendPushes(people, d)).toBe(150);
    expect(d.claimPushes).toHaveBeenCalledTimes(2);
  });

  it("keeps going after one batch's claim fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let call = 0;
    const d = deps({
      claimPushes: vi.fn(async (entries: LogEntry[]) => {
        call += 1;
        if (call === 1) throw new Error("db down");
        return new Set(entries.map((e) => `${e.userId}|${e.kind}|${e.key}`));
      }),
    });
    const people = Array.from({ length: 150 }, (_, i) => msg(`u${i}`));
    expect(await sendPushes(people, d)).toBe(50);
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
