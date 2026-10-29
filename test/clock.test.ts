import { describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: null as { id: string } | null }));
const store = vi.hoisted(() => ({ touchClock: vi.fn(async () => {}) }));

vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: vi.fn(async () => user.current) }));
vi.mock("@/lib/push/store", () => store);

import { reportClock } from "@/app/clock/actions";

describe("reportClock", () => {
  it("notes a signed-in visit and its zone", async () => {
    user.current = { id: "me" };
    await reportClock("Europe/London");
    expect(store.touchClock).toHaveBeenCalledWith("me", "Europe/London");
  });

  it("ignores a zone it doesn't know", async () => {
    user.current = { id: "me" };
    await reportClock("Nowhere/Land");
    expect(store.touchClock).toHaveBeenLastCalledWith("me", null);
  });

  it("does nothing for a visitor who isn't signed in", async () => {
    user.current = null;
    store.touchClock.mockClear();
    await reportClock("Europe/London");
    expect(store.touchClock).not.toHaveBeenCalled();
  });
});
