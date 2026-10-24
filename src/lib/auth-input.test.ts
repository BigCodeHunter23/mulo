import { describe, expect, it, vi } from "vitest";
import { friendlyError, loginInput, signupInput } from "./auth-input";

describe("friendlyError", () => {
  it.each([
    ["Invalid login credentials", /doesn't match an account/],
    ["Email not confirmed", /confirm your email/],
    ["User already registered", /already exists/],
    ["Email rate limit exceeded", /Too many attempts/],
    ["Password should be at least 6 characters", /at least 6/],
    ["Unable to validate email address: invalid format", /valid email/],
  ])("says %j plainly", (raw, expected) => {
    expect(friendlyError(raw)).toMatch(expected);
  });

  it("never shows Supabase's own words for anything else", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyError("JWT secret misconfigured")).toBe(
      "Something went wrong on our side. Please try again in a minute.",
    );
  });
});

describe("input", () => {
  it("logging in needs an email and a password", () => {
    expect(loginInput.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginInput.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });

  it("signing up needs a long enough password", () => {
    expect(signupInput.safeParse({ email: "a@b.co", password: "x" }).success).toBe(false);
  });
});
