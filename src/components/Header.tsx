import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import Avatar from "@/components/Avatar";
import NotificationBell from "@/components/NotificationBell";
import { buttonClass } from "@/components/ui";

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

  const navLink =
    "text-sm text-text-secondary transition-colors hover:text-text";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex items-baseline gap-1.5">
          <span className="display text-xl text-accent">MULO</span>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-5">
          <Link href="/discover" className={navLink}>
            Discover
          </Link>
          <Link href="/search" className={navLink}>
            Search
          </Link>
          <Link href="/people" className={navLink}>
            People
          </Link>
          <Link href="/versus" className={`${navLink} hidden sm:inline`}>
            Versus
          </Link>
          {/* The rest appear as the screen has room; Log out is also on Edit profile. */}
          {user && (
            <>
              <Link
                href={profile?.username ? `/u/${profile.username}` : "/welcome"}
                className={`${navLink} hidden sm:inline`}
              >
                My profile
              </Link>
              <Link href="/goat" className={`${navLink} hidden md:inline`}>
                Your GOAT
              </Link>
              <Link href="/ratings" className={`${navLink} hidden lg:inline`}>
                My ratings
              </Link>
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <form action={logout} className="hidden lg:block">
                <button type="submit" className={navLink}>
                  Log out
                </button>
              </form>
              <NotificationBell />
              <Link
                href={profile?.username ? `/u/${profile.username}` : "/welcome"}
                className="transition-opacity hover:opacity-80"
                aria-label="Your profile"
              >
                <Avatar
                  url={profile?.avatar_url ?? null}
                  name={profile?.display_name || profile?.username || "You"}
                  size="sm"
                />
              </Link>
            </>
          ) : (
            <Link href="/login" className={buttonClass({ size: "sm" })}>
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
