import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import Avatar from "@/components/Avatar";
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
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-1.5">
          <span className="display text-xl text-accent">MULO</span>
        </Link>

        <nav className="flex items-center gap-5">
          <Link href="/search" className={navLink}>
            Search
          </Link>
          <Link href="/people" className={navLink}>
            People
          </Link>
          {user && (
            <Link href="/ratings" className={`${navLink} hidden sm:inline`}>
              My ratings
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <form action={logout}>
                <button type="submit" className={`${navLink} hidden sm:inline`}>
                  Log out
                </button>
              </form>
              <Link
                href={profile?.username ? `/u/${profile.username}` : "/profile"}
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
