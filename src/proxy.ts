import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { appApiProxy, isAppApi } from "@/lib/app-proxy";

export async function proxy(request: NextRequest) {
  // The app signs in by token, so there's no cookie session to refresh.
  if (isAppApi(request.nextUrl.pathname)) return appApiProxy(request);
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
