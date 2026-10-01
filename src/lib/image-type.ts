/**
 * The image format a file really is, read from its first bytes, or null for
 * anything that isn't a JPEG, PNG or WebP. A file's declared type is only the
 * uploader's word for it.
 */
export function imageTypeOf(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  const ascii = (offset: number, text: string) =>
    [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));

  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  return null;
}
