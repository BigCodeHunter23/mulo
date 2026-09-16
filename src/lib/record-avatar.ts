/**
 * Record avatars: somebody's Raised On album drawn as a picture disc, used as
 * their picture until they add a photo. Stored in `avatar_url` as a path on
 * this site, so it works whatever the domain.
 */

const PREFIX = "/records/";

/** Set when somebody hides the Raised On prompt on their feed. */
export const RAISED_ON_PROMPT_COOKIE = "mulo_raised_on_prompt";

/** The sizes the image is made at, so each one can be cached for good. */
export const RECORD_SIZES = [96, 128, 256, 512] as const;
export type RecordSize = (typeof RECORD_SIZES)[number];

export function recordAvatarPath(mbid: string) {
  return `${PREFIX}${mbid}`;
}

/** No picture at all counts too: either way a record can take the spot. */
export function isRecordAvatar(url: string | null | undefined) {
  return !url || url.startsWith(PREFIX);
}

/** The record at a size, for an avatar URL that is one; anything else as it is. */
export function sizedAvatar(url: string, size: RecordSize) {
  return url.startsWith(PREFIX) ? `${url.split("?")[0]}?s=${size}` : url;
}
