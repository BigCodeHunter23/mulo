import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

beforeEach(() => {
  rpc.mockReset();
  vi.resetModules();
});

describe("rate limits", () => {
  it("asks Postgres with the bucket's limit and the caller's address", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { allowAddress } = await import("./rate-limit");
    expect(await allowAddress("login")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_bucket: "login",
      p_subject: "ip:203.0.113.7",
      p_limit: 10,
      p_window_seconds: 300,
    });
  });

  it("says no when Postgres does", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { allowUser } = await import("./rate-limit");
    expect(await allowUser("write", "u1")).toBe(false);
    expect(rpc.mock.calls[0][1].p_subject).toBe("user:u1");
  });

  it("lets everything through, and stops asking, until the migration is run", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    const { allow } = await import("./rate-limit");
    expect(await allow("post", "user:u1")).toBe(true);
    expect(await allow("post", "user:u1")).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("lets the request through if the database can't be asked", async () => {
    rpc.mockRejectedValue(new Error("network down"));
    const { allow } = await import("./rate-limit");
    expect(await allow("write", "user:u1")).toBe(true);
  });
});
