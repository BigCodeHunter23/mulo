import { beforeEach, describe, expect, it, vi } from "vitest";

const apple = vi.hoisted(() => ({
  sealToken: vi.fn(),
  openToken: vi.fn(),
  hasTokenKey: vi.fn(),
  revokeAppleToken: vi.fn(),
}));
vi.mock("@/lib/apple", () => apple);

const db = vi.hoisted(() => ({
  upsert: vi.fn(),
  maybeSingle: vi.fn(),
  deleted: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: db.from }),
}));

import { forgetAppleLink, rememberAppleToken } from "./apple-tokens";

const USER = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  for (const mock of [...Object.values(apple), ...Object.values(db)]) mock.mockReset();
  apple.hasTokenKey.mockReturnValue(true);
  db.upsert.mockResolvedValue({ error: null });
  db.deleted.mockResolvedValue({ error: null });
  db.from.mockImplementation(() => ({
    upsert: db.upsert,
    select: () => ({ eq: () => ({ maybeSingle: db.maybeSingle }) }),
    delete: () => ({ eq: db.deleted }),
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("rememberAppleToken", () => {
  it("stores the sealed token, never the token itself", async () => {
    apple.sealToken.mockReturnValue("sealed-value");
    await rememberAppleToken(USER, "r-token", "com.mulo.app");
    expect(apple.sealToken).toHaveBeenCalledWith("r-token");
    expect(db.from).toHaveBeenCalledWith("apple_tokens");
    expect(db.upsert).toHaveBeenCalledWith(
      { user_id: USER, client_id: "com.mulo.app", refresh_token: "sealed-value" },
      { onConflict: "user_id" },
    );
    expect(JSON.stringify(db.upsert.mock.calls)).not.toContain("r-token");
  });

  it("skips storing while there's no key to seal with", async () => {
    apple.sealToken.mockReturnValue(null);
    await rememberAppleToken(USER, "r-token", "com.mulo.app");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("never throws when the database fails", async () => {
    apple.sealToken.mockReturnValue("sealed-value");
    db.upsert.mockResolvedValue({ error: { message: "relation does not exist" } });
    await expect(rememberAppleToken(USER, "r-token", "com.mulo.app")).resolves.toBeUndefined();
    db.upsert.mockRejectedValue(new Error("network down"));
    await expect(rememberAppleToken(USER, "r-token", "com.mulo.app")).resolves.toBeUndefined();
  });
});

describe("forgetAppleLink", () => {
  it("revokes the token with the client it came from, then deletes the row", async () => {
    db.maybeSingle.mockResolvedValue({
      data: { client_id: "com.mulo.web", refresh_token: "sealed-value" },
      error: null,
    });
    apple.openToken.mockReturnValue("r-token");
    apple.revokeAppleToken.mockResolvedValue(true);
    expect(await forgetAppleLink(USER)).toBe(true);
    expect(apple.openToken).toHaveBeenCalledWith("sealed-value");
    expect(apple.revokeAppleToken).toHaveBeenCalledWith("r-token", "com.mulo.web");
    expect(db.deleted).toHaveBeenCalledWith("user_id", USER);
  });

  it("answers true without revoking when there's nothing stored", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await forgetAppleLink(USER)).toBe(true);
    expect(apple.revokeAppleToken).not.toHaveBeenCalled();
    expect(db.deleted).not.toHaveBeenCalled();
  });

  it("answers false and keeps the row when Apple won't revoke", async () => {
    db.maybeSingle.mockResolvedValue({
      data: { client_id: "com.mulo.app", refresh_token: "sealed-value" },
      error: null,
    });
    apple.openToken.mockReturnValue("r-token");
    apple.revokeAppleToken.mockResolvedValue(false);
    expect(await forgetAppleLink(USER)).toBe(false);
    expect(db.deleted).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[apple] revoke failed");
  });

  it("answers false and drops the row when the stored token can't be opened", async () => {
    db.maybeSingle.mockResolvedValue({
      data: { client_id: "com.mulo.app", refresh_token: "sealed-value" },
      error: null,
    });
    apple.openToken.mockReturnValue(null);
    expect(await forgetAppleLink(USER)).toBe(false);
    expect(apple.revokeAppleToken).not.toHaveBeenCalled();
    expect(db.deleted).toHaveBeenCalledWith("user_id", USER);
  });

  it("answers false and keeps the row while there's no key to open it with", async () => {
    db.maybeSingle.mockResolvedValue({
      data: { client_id: "com.mulo.app", refresh_token: "sealed-value" },
      error: null,
    });
    apple.hasTokenKey.mockReturnValue(false);
    apple.openToken.mockReturnValue(null);
    expect(await forgetAppleLink(USER)).toBe(false);
    expect(apple.revokeAppleToken).not.toHaveBeenCalled();
    expect(db.deleted).not.toHaveBeenCalled();
  });

  it("answers false when the row can't be read", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await forgetAppleLink(USER)).toBe(false);
    expect(apple.revokeAppleToken).not.toHaveBeenCalled();
  });

  it("never logs the token", async () => {
    db.maybeSingle.mockResolvedValue({
      data: { client_id: "com.mulo.app", refresh_token: "sealed-value" },
      error: null,
    });
    apple.openToken.mockReturnValue("r-token");
    apple.revokeAppleToken.mockResolvedValue(false);
    await forgetAppleLink(USER);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("r-token");
    expect(logged).not.toContain("sealed-value");
  });
});
