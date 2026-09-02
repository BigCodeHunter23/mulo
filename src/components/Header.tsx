import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

export default async function Header() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const navLink = "text-sm text-gray-300 hover:text-white transition-colors";

  return (
    <header className="bg-black">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-baseline gap-5">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold leading-none tracking-tight text-mulo-orange">
              MULO
            </span>
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-mulo-orange/70 sm:inline">
              For Music Lovers
            </span>
          </Link>
          <nav className="flex items-baseline gap-4">
            <Link href="/search" className={navLink}>
              Search
            </Link>
            <Link href="/people" className={navLink}>
              People
            </Link>
          </nav>
        </div>

        {user ? (
          <div className="flex items-baseline gap-4">
            <Link href="/ratings" className={navLink}>
              My ratings
            </Link>
            {profile?.username ? (
              <Link href={`/u/${profile.username}`} className={navLink}>
                Profile
              </Link>
            ) : (
              <Link href="/profile" className={navLink}>
                Set up profile
              </Link>
            )}
            <form action={logout}>
              <button type="submit" className={navLink}>
                Log out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded bg-mulo-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-mulo-orange-dark"
          >
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
