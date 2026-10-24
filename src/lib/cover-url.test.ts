import { describe, expect, it } from "vitest";
import { coverSrc } from "./cover-url";

const MBID = "72d15666-99a7-321e-b1f3-a3f8c09dff9f";
const ARCHIVE = `https://coverartarchive.org/release-group/${MBID}`;

describe("coverSrc", () => {
  it("asks the archive for the size wanted", () => {
    expect(coverSrc(`${ARCHIVE}/front-500`, 250)).toBe(`${ARCHIVE}/front-250`);
    expect(coverSrc(`${ARCHIVE}/front-250`)).toBe(`${ARCHIVE}/front-500`);
  });

  it("reads an old stored-cover address as the archive's", () => {
    const stored = `https://abcdefgh.supabase.co/storage/v1/object/public/covers/${MBID}`;
    expect(coverSrc(`${stored}/500.jpg`)).toBe(`${ARCHIVE}/front-500`);
    expect(coverSrc(`${stored}/500.png`, 250)).toBe(`${ARCHIVE}/front-250`);
  });

  it("leaves other pictures alone and has nothing for no cover", () => {
    const avatar = "https://abcdefgh.supabase.co/storage/v1/object/public/avatars/u/avatar.jpg";
    expect(coverSrc(avatar)).toBe(avatar);
    expect(coverSrc("")).toBeNull();
    expect(coverSrc(null)).toBeNull();
  });
});
