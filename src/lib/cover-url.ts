const ARCHIVE = "https://coverartarchive.org/release-group/";

/**
 * Covers MULO once copied into its own storage, which held a release group's
 * cover at {mbid}/500.jpg. Those copies are gone, so an address of that shape
 * still sitting in a row or a cached page is read as the archive's own.
 */
const STORED_COVER =
  /\/storage\/v1\/object\/public\/covers\/([0-9a-f-]{36})\/(250|500)\.(jpg|png)$/;

/**
 * A cover at a given size, served by the Cover Art Archive, which keeps every
 * cover at 250px and 500px so grids can ask for 250 and download a fraction
 * as much.
 */
export function coverSrc(url: string | null | undefined, size: 250 | 500 = 500): string | null {
  if (!url) return null;

  const stored = url.match(STORED_COVER);
  if (stored) return `${ARCHIVE}${stored[1]}/front-${size}`;

  if (url.includes("coverartarchive.org")) {
    return url.replace(/front-(250|500)$/, `front-${size}`);
  }
  return url;
}

/** An artist photo from Wikimedia Commons at a given width. */
export function artistPhotoSrc(url: string | null | undefined, width = 300): string | null {
  if (!url) return null;
  return url.includes("Special:FilePath")
    ? url.replace(/([?&])width=\d+/, `$1width=${width}`)
    : url;
}
