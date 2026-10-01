import { describe, expect, it } from "vitest";
import { loginPath, safeRedirectPath, signupPath } from "./redirects";

describe("safeRedirectPath", () => {
  it.each([
    ["/", "/"],
    ["/album/abc", "/album/abc"],
    ["/u/alex/vs", "/u/alex/vs"],
    ["/charts?type=albums&genre=rap", "/charts?type=albums&genre=rap"],
    ["/lists/12#top", "/lists/12#top"],
    ["/welcome?intro=1", "/welcome?intro=1"],
    // Normalised the way a browser would, still on this site.
    ["/a/../b", "/b"],
    ["/%2F%2Fevil.com", "/%2F%2Fevil.com"],
  ])("keeps %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["protocol-relative", "//evil.com"],
    ["backslash", "/\\evil.com"],
    ["backslash first", "\\\\evil.com"],
    ["tab trick", "/\t/evil.com"],
    ["newline trick", "/\n/evil.com"],
    ["absolute URL", "https://evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative path", "album/abc"],
    ["too long", `/${"a".repeat(3000)}`],
  ])("refuses %s", (_label, input) => {
    expect(safeRedirectPath(input)).toBeNull();
  });

  it.each([undefined, null, 42, {}, ["/"]])("refuses non-strings (%s)", (input) => {
    expect(safeRedirectPath(input)).toBeNull();
  });
});

describe("loginPath and signupPath", () => {
  it("leaves out home and anything unsafe", () => {
    expect(loginPath()).toBe("/login");
    expect(loginPath("/")).toBe("/login");
    expect(loginPath("//evil.com")).toBe("/login");
    expect(signupPath(null)).toBe("/login?mode=signup");
  });

  it("encodes the way back", () => {
    expect(loginPath("/charts?type=songs&genre=rock")).toBe(
      "/login?next=%2Fcharts%3Ftype%3Dsongs%26genre%3Drock",
    );
    expect(signupPath("/versus")).toBe("/login?mode=signup&next=%2Fversus");
  });
});
