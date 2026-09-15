const STORAGE_PATH = "/storage/v1/object/public/covers/";

/**
 * A cover at a given size. Covers copied into MULO's storage are kept at
 * 500px and 250px, and covers still on the Cover Art Archive come in the same
 * sizes, so grids can ask for 250 and download a fraction as much.
 */
export function coverSrc(
  url: string | null | undefined,
  size: 250 | 500 = 500,
): string | null {
  if (!url) return null;

  if (url.includes(STORAGE_PATH)) {
    return url.replace(/\/(250|500)\.(jpg|png)$/, `/${size}.$2`);
  }
  if (url.includes("coverartarchive.org")) {
    return url.replace(/front-(250|500)$/, `front-${size}`);
  }
  return url;
}

/** An artist photo from Wikimedia Commons at a given width. */
export function artistPhotoSrc(
  url: string | null | undefined,
  width = 300,
): string | null {
  if (!url) return null;
  return url.includes("Special:FilePath")
    ? url.replace(/([?&])width=\d+/, `$1width=${width}`)
    : url;
}
