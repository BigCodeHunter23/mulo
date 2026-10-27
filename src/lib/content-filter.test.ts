import { describe, expect, it } from "vitest";
import { isClean, isRespectful, NOT_CLEAN, NOT_RESPECTFUL } from "@/lib/content-filter";

/** Words are spelled out here because the tests need the real thing to match. */
describe("isClean (names, bios, list titles)", () => {
  it("lets ordinary names through", () => {
    for (const name of ["Alex", "radiohead_fan", "Scunthorpe United", "Cocktails & dreams", ""]) {
      expect(isClean(name)).toBe(true);
    }
  });
  it("catches swearing, disguised or not", () => {
    for (const name of ["fuckface", "sh1t"]) expect(isClean(name)).toBe(false);
  });
  it("catches slurs", () => {
    expect(isClean("faggot")).toBe(false);
  });
});

describe("isRespectful (reviews, takes, list notes)", () => {
  it("allows everyday swearing about music", () => {
    expect(isRespectful("This album is fucking incredible")).toBe(true);
    expect(isRespectful("Fuck the Pain Away still slaps")).toBe(true);
  });
  it("blocks slurs, disguised or not", () => {
    expect(isRespectful("what a f4ggot")).toBe(false);
    expect(isRespectful("n1gger")).toBe(false);
    expect(isRespectful("chingchong")).toBe(false);
    expect(isRespectful("Negro Swan is a masterpiece")).toBe(true);
  });
  it("has plain messages", () => {
    expect(NOT_CLEAN).toBe("Please choose something else.");
    expect(NOT_RESPECTFUL).toBe("Please keep it respectful.");
  });
});
