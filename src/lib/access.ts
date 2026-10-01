/**
 * Which pages need an account. This is the one list: the proxy turns
 * signed-out visitors away from these before anything renders, and each page
 * also checks for itself with `requireUser`.
 *
 * Everything else is public on purpose: album, artist and list pages, profiles
 * and their share cards are what people send to each other. The admin inbox
 * isn't listed: it answers "not found" to anyone who isn't an admin, rather
 * than admitting it exists.
 *
 * See the access matrix in docs/hardening-audit.md.
 */
const SIGNED_IN_ONLY: RegExp[] = [
  /^\/stack$/,
  /^\/goat$/,
  /^\/ratings$/,
  /^\/notifications$/,
  /^\/profile(\/.*)?$/,
  /^\/welcome$/,
  /^\/lists\/new$/,
  /^\/badges$/,
  /^\/people$/,
  /^\/u\/[^/]+\/(follows|vs)$/,
  /^\/artist\/[^/]+\/gauntlet$/,
];

export function needsSignIn(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return SIGNED_IN_ONLY.some((pattern) => pattern.test(path));
}
