import { describe, expect, it } from "vitest";
import { imageTypeOf } from "./image-type";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "string" ? [...value].map((char) => char.charCodeAt(0)) : [value],
    ),
  );

describe("imageTypeOf", () => {
  it("knows a JPEG, a PNG and a WebP by their first bytes", () => {
    expect(imageTypeOf(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe("image/jpeg");
    expect(imageTypeOf(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(imageTypeOf(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
  });

  it("refuses anything else, whatever it calls itself", () => {
    expect(imageTypeOf(bytes("<html><script>"))).toBeNull();
    expect(imageTypeOf(bytes("<svg xmlns="))).toBeNull();
    expect(imageTypeOf(bytes("GIF89a"))).toBeNull();
    expect(imageTypeOf(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBeNull();
    expect(imageTypeOf(new Uint8Array())).toBeNull();
  });
});
