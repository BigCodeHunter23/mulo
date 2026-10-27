import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({
  signOut: vi.fn(),
  deleteUser: vi.fn(),
  maybeSingle: vi.fn(),
  broken: false,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (admin.broken) throw new Error("no service role key");
    return {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: admin.maybeSingle }) }) }),
      auth: { admin: { signOut: admin.signOut, deleteUser: admin.deleteUser } },
    };
  },
}));

import { isOtherAccount, JUST_MADE_MS, undoSignIn } from "./other-account";

const NOW = Date.parse("2026-10-27T09:00:00.000Z");
const ID = "1f9df192-a621-4f54-8850-2c5373b7eac9";
const at = (offset: number) => new Date(NOW + offset).toISOString();
const session = (created_at?: string) => ({
  access_token: "access",
  user: { id: ID, ...(created_at === undefined ? {} : { created_at }) },
});

beforeEach(() => {
  admin.broken = false;
  admin.signOut.mockReset().mockResolvedValue({ data: null, error: null });
  admin.deleteUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
  admin.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("isOtherAccount", () => {
  it("is only ever true when an expected account was named and this isn't it", () => {
    expect(isOtherAccount(session(), undefined)).toBe(false);
    expect(isOtherAccount(session(), ID)).toBe(false);
    expect(isOtherAccount(session(), "7d0c1f8e-3b9a-4c2d-9e6f-5a4b3c2d1e0f")).toBe(true);
  });
});

describe("undoSignIn", () => {
  it("ends only the session this sign-in made", async () => {
    await undoSignIn(session(at(-JUST_MADE_MS - 1)), NOW);
    expect(admin.signOut).toHaveBeenCalledWith("access", "local");
    expect(admin.maybeSingle).not.toHaveBeenCalled();
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes an account made just now with no profile, allowing for clocks a little apart", async () => {
    for (const offset of [-JUST_MADE_MS, -1000, 0, 3000]) {
      admin.deleteUser.mockClear();
      await undoSignIn(session(at(offset)), NOW);
      expect(admin.deleteUser, String(offset)).toHaveBeenCalledWith(ID);
    }
  });

  it("keeps an account whose age can't be read", async () => {
    for (const made of [undefined, "", "not a date"]) {
      await undoSignIn(session(made), NOW);
    }
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(admin.signOut).toHaveBeenCalledTimes(3);
  });

  it("never throws, whatever fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    admin.signOut.mockResolvedValue({ data: null, error: { message: "gone" } });
    admin.deleteUser.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(undoSignIn(session(at(0)), NOW)).resolves.toBeUndefined();
    expect(admin.deleteUser).toHaveBeenCalled();

    admin.broken = true;
    await expect(undoSignIn(session(at(0)), NOW)).resolves.toBeUndefined();
    const logged = JSON.stringify(quiet.mock.calls);
    expect(logged).not.toContain("access");
    quiet.mockRestore();
  });
});
