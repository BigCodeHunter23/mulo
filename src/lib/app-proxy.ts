import { NextResponse, type NextRequest } from "next/server";

/**
 * The proxy's part in the app API (`/api/app/*`).
 *
 * Any origin may call it. That's safe because these routes sign people in by
 * bearer token only: cookies are dropped here, so a page elsewhere can't
 * borrow somebody's website session, and it can't send a token it doesn't
 * have. It exists so the app's web preview can call the site too.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function isAppApi(pathname: string): boolean {
  return pathname.startsWith("/api/app/");
}

export function appApiProxy(request: NextRequest): NextResponse {
  if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: CORS });

  // Changes to the request's cookies carry through to the route handler, the
  // same way the session refresh hands on fresh cookies.
  request.cookies.clear();
  const response = NextResponse.next({ request });
  for (const [name, value] of Object.entries(CORS)) response.headers.set(name, value);
  return response;
}
