import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "../../../test/fake-supabase";

/** The bell's line when an import finishes. The service role is a stand-in. */

const db = vi.hoisted(() => ({ admin: null as unknown as FakeSupabase }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin.client }));
vi.mock("@/lib/supabase/errors", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/errors")>()),
  logQueryError: vi.fn(),
}));

import { fakeSupabase } from "../../../test/fake-supabase";
import { logQueryError } from "@/lib/supabase/errors";
import { diaryImportNotifications, latestDiaryImportAt } from "./notifications";

const LASTFM = { source: "lastfm", last_import_at: "2026-10-29T10:00:00+00:00", last_count: 820 };
const SPOTIFY = { source: "spotify", last_import_at: "2026-10-30T09:00:00+00:00", last_count: 1 };

beforeEach(() => {
  db.admin = fakeSupabase();
  vi.clearAllMocks();
});

describe("diaryImportNotifications", () => {
  it("gives a line for each source that finished an import, with its count", async () => {
    db.admin.answer("diary_sources", { data: [LASTFM, SPOTIFY], error: null });
    expect(await diaryImportNotifications("me")).toEqual([
      {
        kind: "diary-import",
        key: "diary-import-lastfm-2026-10-29T10:00:00+00:00",
        at: "2026-10-29T10:00:00+00:00",
        source: "lastfm",
        count: 820,
      },
      {
        kind: "diary-import",
        key: "diary-import-spotify-2026-10-30T09:00:00+00:00",
        at: "2026-10-30T09:00:00+00:00",
        source: "spotify",
        count: 1,
      },
    ]);
    const calls = db.admin.callsOn("diary_sources");
    expect(calls).toContainEqual({ table: "diary_sources", method: "eq", args: ["user_id", "me"] });
  });

  it("says nothing for an import that added nothing, or one not finished", async () => {
    db.admin.answer("diary_sources", {
      data: [
        { ...LASTFM, last_count: 0 },
        { ...SPOTIFY, last_count: null },
        { source: "apple", last_import_at: null, last_count: 40 },
      ],
      error: null,
    });
    expect(await diaryImportNotifications("me")).toEqual([]);
  });

  it("says nothing before migration 0025, quietly", async () => {
    db.admin.answer("diary_sources", {
      data: null,
      error: { code: "PGRST205", message: "Could not find the table" },
    });
    expect(await diaryImportNotifications("me")).toEqual([]);
    expect(logQueryError).not.toHaveBeenCalled();
  });

  it("says nothing, and logs why, when the read fails", async () => {
    db.admin.answer("diary_sources", { data: null, error: { code: "57014", message: "timeout" } });
    expect(await diaryImportNotifications("me")).toEqual([]);
    expect(logQueryError).toHaveBeenCalled();
  });
});

describe("latestDiaryImportAt", () => {
  it("is the newest finished import, for the bell's dot", async () => {
    db.admin.answer("diary_sources", { data: [SPOTIFY, LASTFM], error: null });
    expect(await latestDiaryImportAt("me")).toBe(SPOTIFY.last_import_at);
  });

  it("is null with none", async () => {
    db.admin.answer("diary_sources", { data: [], error: null });
    expect(await latestDiaryImportAt("me")).toBeNull();
  });
});
