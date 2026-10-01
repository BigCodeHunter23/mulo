/**
 * Where to send somebody next, after logging in or following an email link.
 * Shared by server actions, route handlers and client components, so it has
 * no server-only imports.
 */

// Any origin will do as long as it is never a real one: it only exists so a
// relative path can be parsed the way a browser would parse it.
const BASE = "https://mulo.invalid";

/**
 * A path on this site that's safe to redirect to, or null.
 *
 * Browsers are generous with what they treat as a link to another site:
 * "//evil.com", "/\evil.com" and "/<tab>/evil.com" all leave the site, so
 * checking for a leading slash is not enough. This refuses backslashes and
 * control characters outright, then parses the path the way a browser would
 * and checks it stayed on the same origin.
 */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > 2048) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * A path with the query parameters that are set, so a page's filters survive
 * a trip through the login page. Empty and missing values are left out.
 */
export function withQuery(
  path: string,
  query: Record<string, string | undefined | null>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * The login page, remembering where to come back to. Home is where login goes
 * anyway, so it isn't spelled out.
 */
export function loginPath(next?: string | null): string {
  const path = safeRedirectPath(next);
  return path && path !== "/" ? `/login?next=${encodeURIComponent(path)}` : "/login";
}

/** The same for signing up, which shares the login page. */
export function signupPath(next?: string | null): string {
  const path = safeRedirectPath(next);
  return path && path !== "/"
    ? `/login?mode=signup&next=${encodeURIComponent(path)}`
    : "/login?mode=signup";
}
