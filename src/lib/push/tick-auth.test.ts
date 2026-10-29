import { describe, expect, it } from "vitest";
import { tickAllowed } from "@/lib/push/tick-auth";

const SECRET = "s".repeat(40);

describe("the clock's secret", () => {
  it("lets in only the exact bearer secret", () => {
    expect(tickAllowed(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(tickAllowed(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(tickAllowed(SECRET, SECRET)).toBe(false);
    expect(tickAllowed(null, SECRET)).toBe(false);
  });

  it("refuses everything while the secret is missing or short", () => {
    expect(tickAllowed("Bearer ", "")).toBe(false);
    expect(tickAllowed("Bearer short", "short")).toBe(false);
    expect(tickAllowed("Bearer x", undefined)).toBe(false);
  });

  it("accepts a secret of exactly 32 characters", () => {
    const secret = "k".repeat(32);
    expect(tickAllowed(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("refuses a lowercase bearer prefix", () => {
    expect(tickAllowed(`bearer ${SECRET}`, SECRET)).toBe(false);
  });
});
