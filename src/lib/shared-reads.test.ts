import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());

// As the real one does: stores what comes back as JSON, and nothing when the read throws.
vi.mock("next/cache", () => ({
  unstable_cache:
    (read: (...args: unknown[]) => Promise<unknown>, keys: string[]) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      const kept = store.get(key);
      if (typeof kept === "string") return JSON.parse(kept);
      const value = await read(...args);
      store.set(key, JSON.stringify(value));
      return value;
    },
}));

import { inSignedOutRead, watchedFetch } from "@/lib/supabase/signed-out-reads";
import { keptRead, sharedWhenSignedOut } from "./shared-reads";

beforeEach(() => store.clear());
afterEach(() => vi.restoreAllMocks());

describe("keptRead", () => {
  it("reads once and shares the answer", async () => {
    const read = vi.fn(async (id: string) => `album ${id}`);
    const kept = keptRead("album", 60, read);
    expect(await kept("a")).toBe("album a");
    expect(await kept("a")).toBe("album a");
    expect(read).toHaveBeenCalledOnce();
  });

  it("reads again for something else", async () => {
    const read = vi.fn(async (id: string) => `album ${id}`);
    const kept = keptRead("album", 60, read);
    await kept("a");
    await kept("b");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("doesn't keep an answer of nothing, so it's asked again next time", async () => {
    const read = vi.fn(async () => null);
    const kept = keptRead("album", 60, read);
    expect(await kept()).toBeNull();
    expect(await kept()).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("shows but doesn't keep what was read while the database was in trouble", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
    const read = vi.fn(async () => {
      await watchedFetch("https://db.test/rest");
      return { reviews: [] };
    });
    const kept = keptRead("voices", 60, read);
    expect(await kept()).toEqual({ reviews: [] });
    await kept();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("lets a real error through", async () => {
    const kept = keptRead("album", 60, async () => {
      throw new Error("boom");
    });
    await expect(kept()).rejects.toThrow("boom");
  });

  it("reads as nobody, so it never touches a visitor's cookies", async () => {
    const kept = keptRead("album", 60, async () => inSignedOutRead());
    expect(await kept()).toBe(true);
  });
});

describe("sharedWhenSignedOut", () => {
  it("shares one answer between signed-out visitors", async () => {
    const read = vi.fn(async (id: string) => `scores ${id}`);
    const voices = sharedWhenSignedOut("voices", 60, read);
    expect(await voices(false, "a")).toBe("scores a");
    expect(await voices(false, "a")).toBe("scores a");
    expect(read).toHaveBeenCalledOnce();
  });

  it("reads afresh for somebody signed in, as themselves, and keeps nothing", async () => {
    const read = vi.fn(async () => inSignedOutRead());
    const voices = sharedWhenSignedOut("voices", 60, read);
    expect(await voices(true)).toBe(false);
    expect(await voices(true)).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(0);
  });

  it("never hands somebody signed in what signed-out visitors share", async () => {
    let reads = 0;
    const voices = sharedWhenSignedOut("voices", 60, async () => `read ${++reads}`);
    expect(await voices(false)).toBe("read 1");
    expect(await voices(true)).toBe("read 2");
    expect(await voices(false)).toBe("read 1");
  });
});
