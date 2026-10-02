import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env";
import { NextResponse, type NextRequest } from "next/server";
import { needsSignIn } from "@/lib/access";
import { safeRedirectPath } from "@/lib/redirects";
import { SESSION_COOKIE_OPTIONS } from "./cookies";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refreshes an expired session and verifies the token. getClaims() checks
  // the token's signature locally where it can, instead of asking Supabase
  // over the network on every page load as getUser() does.
  // Do not add logic between createServerClient and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  // Pages that need an account turn signed-out visitors away here, with a
  // real redirect before anything renders. (A redirect from inside a page can
  // only arrive after the loading screen has started streaming, as a 200.)
  // Page loads only: server actions are POSTs to the page's own address, and
  // they answer a signed-out caller themselves with a "log in" message.
  const { pathname, search } = request.nextUrl;
  const pageLoad = request.method === "GET" || request.method === "HEAD";
  if (!signedIn && pageLoad && needsSignIn(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    const back = safeRedirectPath(`${pathname}${search}`);
    if (back) login.searchParams.set("next", back);

    const redirect = NextResponse.redirect(login);
    // Keep any cookie changes from the refresh above, such as a cleared session.
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return supabaseResponse;
}
