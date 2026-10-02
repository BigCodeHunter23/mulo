import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import AccountMenu from "@/components/AccountMenu";
import LoginLink from "@/components/LoginLink";
import MobileNav from "@/components/MobileNav";
import NavLink from "@/components/NavLink";
import NotificationBell from "@/components/NotificationBell";
import SiteSearch from "@/components/SiteSearch";
import { buttonClass } from "@/components/ui";

/**
 * The bar across the top of every page, worked out on the server from the
 * session cookie so it never flashes the wrong state.
 *
 * The links are the public places anyone can go. Everything that belongs to
 * the signed-in person (their pages, People, settings, logging out) lives in
 * the menu behind their avatar; signed out, that corner offers Log in and Join.
 */
export default async function Header() {
  const user = await getCurrentUser();

  const { data: profile } = user
    ? await (
        await createClient()
      )
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const profileHref = profile?.username ? `/u/${profile.username}` : "/welcome";
  const name = profile?.display_name || profile?.username || "You";

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
          <Link href="/" className="flex shrink-0 items-baseline gap-1.5" aria-label="MULO home">
            <span className="display text-xl text-accent">MULO</span>
          </Link>

          {/* On phones these live in the tab bar at the bottom instead. */}
          <nav aria-label="Main" className="hidden shrink-0 items-center gap-5 sm:flex">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/discover">Discover</NavLink>
            <NavLink href="/charts">Charts</NavLink>
            <NavLink href="/versus">Versus</NavLink>
            <NavLink href="/lists" className="hidden md:inline">
              Lists
            </NavLink>
          </nav>

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
            <SiteSearch />
            {user ? (
              <>
                <NotificationBell />
                <AccountMenu
                  profile={{
                    username: profile?.username ?? null,
                    name,
                    avatarUrl: profile?.avatar_url ?? null,
                  }}
                />
              </>
            ) : (
              <>
                {/* On phones, Log in is in the tab bar. */}
                <span className="hidden sm:block">
                  <LoginLink className={buttonClass({ variant: "ghost", size: "sm" })}>
                    Log in
                  </LoginLink>
                </span>
                <span className="shrink-0">
                  <LoginLink mode="signup" className={buttonClass({ size: "sm" })}>
                    Join
                  </LoginLink>
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <MobileNav
        profile={user ? { href: profileHref, avatarUrl: profile?.avatar_url ?? null, name } : null}
      />
    </>
  );
}
