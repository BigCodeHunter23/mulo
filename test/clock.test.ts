import { beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: null as { id: string } | null, limited: false }));
const store = vi.hoisted(() => ({ touchClock: vi.fn(async () => {}) }));

vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: vi.fn(async () => user.current) }));
vi.mock("@/lib/push/store", () => store);
vi.mock("@/lib/rate-limit", () => ({ allowUser: vi.fn(async () => !user.limited) }));

import { reportClock } from "@/app/clock/actions";
import { allowUser } from "@/lib/rate-limit";

beforeEach(() => {
  user.limited = false;
});

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

  it("saves the zone in the runtime's own spelling", async () => {
    user.current = { id: "me" };
    await reportClock("europe/london");
    expect(store.touchClock).toHaveBeenLastCalledWith("me", "Europe/London");
  });

  it("is held to the write limit", async () => {
    user.current = { id: "me" };
    user.limited = true;
    store.touchClock.mockClear();
    await reportClock("Europe/London");
    expect(allowUser).toHaveBeenCalledWith("write", "me");
    expect(store.touchClock).not.toHaveBeenCalled();
  });

  it("does nothing for a visitor who isn't signed in", async () => {
    user.current = null;
    store.touchClock.mockClear();
    await reportClock("Europe/London");
    expect(store.touchClock).not.toHaveBeenCalled();
  });
});
