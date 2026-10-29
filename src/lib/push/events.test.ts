import { describe, expect, it, vi } from "vitest";
import {
  notifyFollow,
  notifyLove,
  notifyReply,
  PEOPLE_PUSHES_PER_HOUR,
  type EventDeps,
} from "@/lib/push/events";

vi.mock("@/lib/push/store", () => ({}));
vi.mock("@/lib/push/send", () => ({}));

const at = new Date("2026-10-29T08:42:00Z");

function deps(over: Partial<EventDeps> = {}): EventDeps {
  return {
    personOf: vi.fn(async (id: string) =>
      id === "joe-id"
        ? { username: "joe", display_name: "Jo" }
        : { username: "sam", display_name: "Sam" },
    ),
    peoplePushesSince: vi.fn(async () => 0),
    blockedEitherWay: vi.fn(async () => false),
    loveTarget: vi.fn(async () => ({
      ownerId: "owner",
      subject: { kind: "album" as const, mbid: "m1", title: "Blonde", review: true },
    })),
    replyTarget: vi.fn(async () => ({
      ownerId: "owner",
      owner: { username: "sam", display_name: "Sam" },
      subject: { kind: "album" as const, mbid: "m1", id: 7, title: "Blonde" },
      openMatchup: null as number | null,
    })),
    peopleNamed: vi.fn(
      async () => [] as { id: string; username: string; display_name: string | null }[],
    ),
    picksIn: vi.fn(async () => new Set<string>()),
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

  it("asks about blocks between the right two people", async () => {
    const d = deps();
    await notifyFollow("sam-id", "jo-id", at, d);
    expect(d.blockedEitherWay).toHaveBeenCalledWith("jo-id", "sam-id");
    await notifyLove("album", 7, "sam-id", at, d);
    expect(d.blockedEitherWay).toHaveBeenCalledWith("owner", "sam-id");
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
    expect(d.loveTarget).toHaveBeenCalledTimes(1);
    expect(d.loveTarget).not.toHaveBeenCalledWith("pick", 1);
  });

  it("stops pushing follows and loves to somebody who's had ten in the last hour", async () => {
    const d = deps({ peoplePushesSince: vi.fn(async () => PEOPLE_PUSHES_PER_HOUR) });
    await notifyFollow("sam-id", "jo-id", at, d);
    await notifyLove("album", 7, "sam-id", at, d);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.peoplePushesSince).toHaveBeenCalledWith("jo-id", new Date("2026-10-29T07:42:00Z"));
    expect(d.peoplePushesSince).toHaveBeenCalledWith("owner", new Date("2026-10-29T07:42:00Z"));
  });

  it("still pushes the tenth", async () => {
    const d = deps({ peoplePushesSince: vi.fn(async () => PEOPLE_PUSHES_PER_HOUR - 1) });
    await notifyFollow("sam-id", "jo-id", at, d);
    expect(d.send).toHaveBeenCalledTimes(1);
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

describe("reply pushes", () => {
  const reply = (body = "So good.\nMore") => ({
    kind: "album" as const,
    targetId: 7,
    replierId: "joe-id",
    body,
  });
  const kim = { id: "kim-id", username: "kim", display_name: "Kim" };

  it("tells the author, once an hour per thread", async () => {
    const d = deps();
    await notifyReply(reply(), at, d);
    expect(d.send).toHaveBeenCalledWith([
      {
        userId: "owner",
        kind: "reply",
        key: "album-7:2026-10-29T08",
        title: "Jo replied to your review of Blonde",
        body: "So good.",
        url: "/album/m1/reviews/7",
      },
    ]);
    expect(d.peopleNamed).not.toHaveBeenCalled();
  });

  it("tells somebody named, with the same thread's key", async () => {
    const d = deps({ peopleNamed: vi.fn(async () => [kim]) });
    await notifyReply(reply("@kim listen"), at, d);
    expect(d.peopleNamed).toHaveBeenCalledWith(["kim"]);
    expect(d.send).toHaveBeenCalledWith([
      expect.objectContaining({ userId: "owner" }),
      {
        userId: "kim-id",
        kind: "reply",
        key: "album-7:2026-10-29T08",
        title: "Jo mentioned you on Sam's review of Blonde",
        body: "@kim listen",
        url: "/album/m1/reviews/7",
      },
    ]);
  });

  it("gives a named author the author's push only, and never the replier one", async () => {
    const d = deps({
      peopleNamed: vi.fn(async () => [
        { id: "owner", username: "sam", display_name: "Sam" },
        { id: "joe-id", username: "joe", display_name: "Jo" },
      ]),
    });
    await notifyReply(reply("@sam @joe"), at, d);
    const sent = vi.mocked(d.send).mock.calls[0]?.[0] ?? [];
    expect(sent.map((m) => [m.userId, m.title])).toEqual([
      ["owner", "Jo replied to your review of Blonde"],
    ]);
  });

  it("never pushes your own reply on your own review to you", async () => {
    const d = deps({ peopleNamed: vi.fn(async () => [kim]) });
    await notifyReply({ ...reply("@kim"), replierId: "owner" }, at, d);
    const sent = vi.mocked(d.send).mock.calls[0]?.[0] ?? [];
    expect(sent.map((m) => m.userId)).toEqual(["kim-id"]);
  });

  it("stays quiet across a block, with the replier or the thread's owner", async () => {
    const d = deps({
      peopleNamed: vi.fn(async () => [kim]),
      blockedEitherWay: vi.fn(
        async (a: string, b: string) => [a, b].includes("kim-id") && [a, b].includes("owner"),
      ),
    });
    await notifyReply(reply("@kim"), at, d);
    const sent = vi.mocked(d.send).mock.calls[0]?.[0] ?? [];
    expect(sent.map((m) => m.userId)).toEqual(["owner"]);
  });

  it("counts reply pushes in the cap of ten an hour", async () => {
    const d = deps({ peoplePushesSince: vi.fn(async () => PEOPLE_PUSHES_PER_HOUR) });
    await notifyReply(reply(), at, d);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("names on a take on today's Versus push only people who picked", async () => {
    const d = deps({
      replyTarget: vi.fn(async () => ({
        ownerId: "owner",
        owner: { username: "sam", display_name: "Sam" },
        subject: { kind: "take" as const, day: "2026-10-29", id: 9, title: "Under Pressure" },
        openMatchup: 3 as number | null,
      })),
      peopleNamed: vi.fn(async () => [kim, { id: "lee-id", username: "lee", display_name: null }]),
      picksIn: vi.fn(async () => new Set(["lee-id"])),
    });
    await notifyReply({ kind: "take", targetId: 9, replierId: "joe-id", body: "@kim @lee" }, at, d);
    expect(d.picksIn).toHaveBeenCalledWith(3, ["kim-id", "lee-id"]);
    const sent = vi.mocked(d.send).mock.calls[0]?.[0] ?? [];
    expect(sent.map((m) => [m.userId, m.key])).toEqual([
      ["owner", "take-9:2026-10-29T08"],
      ["lee-id", "take-9:2026-10-29T08"],
    ]);
  });

  it("sends nothing for a review that's gone, and never throws", async () => {
    const d = deps({ replyTarget: vi.fn(async () => null) });
    await notifyReply(reply(), at, d);
    expect(d.send).not.toHaveBeenCalled();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = deps({
      replyTarget: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    await expect(notifyReply(reply(), at, broken)).resolves.toBeUndefined();
  });
});
