import type { NextRequest } from "next/server";

/** The pages anyone can open that read from the database. */
const PUBLIC_PAGES = /^\/(?:$|(?:album|artist|u|versus|charts|discover|drop|guess)(?:\/|$))/;

/** Share pictures live under those pages' addresses, but link previews ask for them. */
const SHARE_IMAGE = /\/(?:opengraph|twitter)-image[^/]*$/;

/**
 * Link previews come in bursts from shared addresses, and a preview that fails
 * stays failed wherever the link was shared. Search engines aren't here: a 429
 * only slows them, and theirs are the names scrapers most often borrow.
 */
const LINK_PREVIEW =
  /facebookexternalhit|twitterbot|slackbot|whatsapp|discordbot|linkedinbot|telegrambot/i;

export const SLOW_DOWN = "You're loading pages very quickly. Please wait a minute and try again.";

/**
 * Whether a request is somebody opening a page, for the limit on signed-out
 * visitors. The browser getting linked pages ready doesn't count: a page of
 * album covers would use the limit up before anybody clicked. Browsers mark
 * that as `sec-fetch-dest: empty`, because Next strips its own prefetch header
 * before the proxy runs. A script could claim the same, but this only needs to
 * slow the ones that aren't trying to hide.
 */
export function countsAsPageLoad(request: NextRequest): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.headers.get("sec-fetch-dest") === "empty") return false;
  if (LINK_PREVIEW.test(request.headers.get("user-agent") ?? "")) return false;
  const { pathname } = request.nextUrl;
  return PUBLIC_PAGES.test(pathname) && !SHARE_IMAGE.test(pathname);
}

/**
 * The visitor's address. Vercel sets these headers itself, so they can't be
 * forged. Null without them, so that everybody isn't limited as one person.
 */
export function visitorAddress(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}
