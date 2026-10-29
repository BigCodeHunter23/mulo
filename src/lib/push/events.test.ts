import { describe, expect, it, vi } from "vitest";
import { notifyFollow, notifyLove, type EventDeps } from "@/lib/push/events";

vi.mock("@/lib/push/store", () => ({}));
vi.mock("@/lib/push/send", () => ({}));

const at = new Date("2026-10-29T08:42:00Z");

function deps(over: Partial<EventDeps> = {}): EventDeps {
  return {
    personOf: vi.fn(async () => ({ username: "sam", display_name: "Sam" })),
    blockedEitherWay: vi.fn(async () => false),
    loveTarget: vi.fn(async () => ({
      ownerId: "owner",
      subject: { kind: "album" as const, mbid: "m1", title: "Blonde", review: true },
    })),
    send: vi.fn(async () => 1),
    ...over,
  };
}

describe("pushes from what people do", () => {
  it("tells somebody who followed them, once a day per follower", async () => {
    const d = deps();
    await notifyFollow("sam-id", "jo-id", at, d);
    expect(d.send).toHaveBeenCalledWith([
      {
        userId: "jo-id",
        kind: "follow",
        key: "sam-id:2026-10-29",
        title: "Sam followed you",
        url: "/u/sam",
      },
    ]);
  });

  it("stays quiet between people who've blocked each other", async () => {
    const d = deps({ blockedEitherWay: vi.fn(async () => true) });
    await notifyFollow("sam-id", "jo-id", at, d);
    await notifyLove("album", 7, "sam-id", at, d);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("tells the owner about a love, once an hour per rating", async () => {
    const d = deps();
    await notifyLove("album", 7, "sam-id", at, d);
    expect(d.send).toHaveBeenCalledWith([
      {
        userId: "owner",
        kind: "love",
        key: "album-7:2026-10-29T08",
        title: "Sam loved your review of Blonde",
        url: "/album/m1",
      },
    ]);
  });

  it("never pushes a love on your own rating, or on a Versus pick", async () => {
    const d = deps({
      loveTarget: vi.fn(async () => ({
        ownerId: "sam-id",
        subject: { kind: "artist" as const, mbid: "a", name: "X" },
      })),
    });
    await notifyLove("artist", 1, "sam-id", at, d);
    await notifyLove("pick", 1, "sam-id", at, d);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      personOf: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    await expect(notifyFollow("a", "b", at, d)).resolves.toBeUndefined();
  });
});
