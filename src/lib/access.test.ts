import { describe, expect, it } from "vitest";
import { needsSignIn } from "./access";

describe("needsSignIn", () => {
  it.each([
    "/stack",
    "/goat",
    "/ratings",
    "/notifications",
    "/profile",
    "/profile/raised-on",
    "/welcome",
    "/lists/new",
    "/badges",
    "/people",
    "/people/",
    "/u/alex/follows",
    "/u/alex/vs",
    "/artist/0383dadf-2a4e-4d10-a46a-e9e041da8eb3/gauntlet",
  ])("guards %s", (path) => {
    expect(needsSignIn(path)).toBe(true);
  });

  it.each([
    "/",
    "/discover",
    "/charts",
    "/search",
    "/versus",
    "/versus/2026-10-01",
    "/drop",
    "/guess",
    "/lists",
    "/lists/12",
    "/album/0383dadf-2a4e-4d10-a46a-e9e041da8eb3",
    "/artist/0383dadf-2a4e-4d10-a46a-e9e041da8eb3",
    "/u/alex",
    "/u/alex/badges",
    "/u/alex/lists",
    "/u/alex/mixtape/2026-09",
    "/u/alex/milestone/100",
    "/join/abcdef0123",
    "/login",
    "/auth/reset",
    "/admin/reports",
    // Similar names that aren't the guarded pages.
    "/stacks",
    "/peoplex",
    "/u/people",
  ])("leaves %s public", (path) => {
    expect(needsSignIn(path)).toBe(false);
  });
});
