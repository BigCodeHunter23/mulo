import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import Avatar from "@/components/Avatar";
import MobileNav from "@/components/MobileNav";
import NavLink from "@/components/NavLink";
import NotificationBell from "@/components/NotificationBell";
import { buttonClass } from "@/components/ui";

function PeopleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2" />
    </svg>
  );
}

export default async function Header() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: profile } = user
    ? await supabase
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
          <Link href="/" className="flex items-baseline gap-1.5" aria-label="MULO home">
            <span className="display text-xl text-accent">MULO</span>
          </Link>

          {/* On phones these live in the tab bar at the bottom instead. */}
          <nav className="hidden items-center gap-5 sm:flex">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/discover">Discover</NavLink>
            <NavLink href="/charts">Charts</NavLink>
            <NavLink href="/search">Search</NavLink>
            <NavLink href="/people">People</NavLink>
            <NavLink href="/versus">Versus</NavLink>
            {/* The rest appear as the screen has room; Log out is also on Edit profile. */}
            {user && (
              <>
                <NavLink href={profileHref} className="hidden md:inline">
                  My profile
                </NavLink>
                <NavLink href="/goat" className="hidden md:inline">
                  Your GOAT
                </NavLink>
                <NavLink href="/ratings" className="hidden lg:inline">
                  My ratings
                </NavLink>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link
              href="/people"
              aria-label="People"
              className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-raised hover:text-text sm:hidden"
            >
              <PeopleIcon />
            </Link>
            {user ? (
              <>
                <form action={logout} className="hidden lg:block">
                  <button
                    type="submit"
                    className="text-sm text-text-secondary transition-colors hover:text-text"
                  >
                    Log out
                  </button>
                </form>
                <NotificationBell />
                <Link
                  href={profileHref}
                  className="hidden transition-opacity hover:opacity-80 sm:block"
                  aria-label="Your profile"
                >
                  <Avatar url={profile?.avatar_url ?? null} name={name} size="sm" />
                </Link>
              </>
            ) : (
              <span className="hidden sm:block">
                <Link href="/login" className={buttonClass({ size: "sm" })}>
                  Log in
                </Link>
              </span>
            )}
          </div>
        </div>
      </header>

      <MobileNav
        profile={
          user
            ? { href: profileHref, avatarUrl: profile?.avatar_url ?? null, name }
            : null
        }
      />
    </>
  );
}
