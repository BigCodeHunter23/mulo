import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({ pushCopyOf: vi.fn() }));

/** A query that can be chained any way and answers nothing when awaited. */
function query(): unknown {
  const chain: unknown = new Proxy(() => {}, {
    get(_target, name) {
      if (name === "then") {
        return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
      }
      return () => chain;
    },
  });
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: query })) }));
vi.mock("@/lib/push/store", () => push);

import { exportFor } from "@/lib/export";

const ME = { id: "me", email: "me@example.com" } as Parameters<typeof exportFor>[0];

beforeEach(() => {
  push.pushCopyOf.mockReset();
});

describe("a copy of your data", () => {
  it("includes your push settings and phones", async () => {
    const settings = { time_zone: "Europe/London", last_seen_at: "2026-10-29T08:00:00Z" };
    const phones = [
      { platform: "ios", created_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-10-29T08:00:00Z" },
    ];
    push.pushCopyOf.mockResolvedValue({ settings, phones });
    const body = JSON.parse((await exportFor(ME)).body) as Record<string, unknown>;
    expect(push.pushCopyOf).toHaveBeenCalledWith("me");
    expect(body.push_settings).toEqual(settings);
    expect(body.push_phones).toEqual(phones);
    expect(body.replies).toEqual([]);
  });

  it("still comes when the push settings can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    push.pushCopyOf.mockRejectedValue(new Error("relation does not exist"));
    const body = JSON.parse((await exportFor(ME)).body) as Record<string, unknown>;
    expect(body.push_settings).toBeNull();
    expect(body.push_phones).toEqual([]);
    expect(body.album_ratings).toEqual([]);
  });
});
