import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({ pushCopyOf: vi.fn() }));
const diary = vi.hoisted(() => ({ diaryCopyOf: vi.fn() }));

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
vi.mock("@/lib/diary/read", () => diary);

import { exportFor } from "@/lib/export";
import { createClient } from "@/lib/supabase/server";

const ME = { id: "me", email: "me@example.com" } as Parameters<typeof exportFor>[0];

beforeEach(() => {
  push.pushCopyOf.mockReset();
  diary.diaryCopyOf.mockReset();
  diary.diaryCopyOf.mockResolvedValue({ entries: [], sources: [] });
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

  it("includes your diary and its sources, never the Last.fm session", async () => {
    push.pushCopyOf.mockResolvedValue({ settings: null, phones: [] });
    const entries = [
      {
        day: "2026-10-12",
        artist_name: "Frank Ocean",
        album_name: "Blonde",
        release_mbid: null,
        sources: ["lastfm"],
        songs: 6,
        minutes: 40,
        plays: 7,
        created_at: "2026-10-13T00:00:00Z",
      },
    ];
    const sources = [
      {
        source: "lastfm",
        state: "syncing",
        lastfm_user: "franlistens",
        reached_back: null,
        synced_to: "2026-10-30T09:00:00Z",
        last_import_at: null,
        last_count: null,
      },
    ];
    diary.diaryCopyOf.mockResolvedValue({ entries, sources });
    const copy = (await exportFor(ME)).body;
    const body = JSON.parse(copy) as Record<string, unknown>;
    expect(diary.diaryCopyOf).toHaveBeenCalledWith("me");
    expect(body.diary).toEqual({ entries, sources });
    expect(copy).not.toContain("lastfm_session");
  });

  it("still comes when the diary can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    push.pushCopyOf.mockResolvedValue({ settings: null, phones: [] });
    diary.diaryCopyOf.mockRejectedValue(new Error("connection reset"));
    const body = JSON.parse((await exportFor(ME)).body) as Record<string, unknown>;
    expect(body.diary).toBeNull();
    expect(body.album_ratings).toEqual([]);
  });

  it("includes the artists you follow", async () => {
    push.pushCopyOf.mockResolvedValue({ settings: null, phones: [] });
    const follows = [{ artist_mbid: "tyler", created_at: "2026-10-30T00:00:00Z" }];
    vi.mocked(createClient).mockResolvedValueOnce({
      from: (table: string) =>
        table === "artist_follows"
          ? {
              select: () => ({
                eq: () => ({
                  order: () => ({ range: async () => ({ data: follows, error: null }) }),
                }),
              }),
            }
          : query(),
    } as never);
    const body = JSON.parse((await exportFor(ME)).body) as Record<string, unknown>;
    expect(body.following_artists).toEqual(follows);
  });
});
