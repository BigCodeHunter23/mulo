import { describe, expect, it } from "vitest";
import { followersLine } from "@/lib/artist-follows-shared";

describe("followersLine", () => {
  it("counts followers from three, with a thousands comma", () => {
    expect(followersLine(0)).toBeNull();
    expect(followersLine(2)).toBeNull();
    expect(followersLine(3)).toBe("3 followers");
    expect(followersLine(1204)).toBe("1,204 followers");
  });
});
