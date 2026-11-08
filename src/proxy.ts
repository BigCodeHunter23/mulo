import { NextResponse, type NextRequest } from "next/server";
import { isBlockedCrawler } from "@/lib/crawlers";
import { updateSession } from "@/lib/supabase/middleware";
import { appApiProxy, isAppApi } from "@/lib/app-proxy";

export async function proxy(request: NextRequest) {
  // First, so it costs nothing: no session, no render, no database.
  if (isBlockedCrawler(request.headers.get("user-agent"))) {
    return new NextResponse("MULO doesn't allow this crawler. See /robots.txt.", { status: 403 });
  }
  // The app signs in by token, so there's no cookie session to refresh.
  if (isAppApi(request.nextUrl.pathname)) return appApiProxy(request);
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
