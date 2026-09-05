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

  const navLink =
    "text-sm whitespace-nowrap text-gray-300 hover:text-white transition-colors";

  return (
    <header className="bg-black">
      {/* Two rows on a phone (brand and account, then navigation) so the
          links never wrap into an untidy stack. */}
      <div className="mx-auto max-w-5xl px-4 py-2.5 sm:py-3">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold leading-none tracking-tight text-mulo-orange">
              MULO
            </span>
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-mulo-orange/70 sm:inline">
              For Music Lovers
            </span>
          </Link>

          <nav className="hidden items-baseline gap-4 sm:flex">
            <Link href="/search" className={navLink}>
              Search
            </Link>
            <Link href="/people" className={navLink}>
              People
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-4">
            {user ? (
              <>
                <Link href="/ratings" className={navLink}>
                  Ratings
                </Link>
                <Link
                  href={profile?.username ? `/u/${profile.username}` : "/profile"}
                  className={navLink}
                >
                  {profile?.username ? "Profile" : "Set up profile"}
                </Link>
                <form action={logout}>
                  <button type="submit" className={navLink}>
                    Log out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded bg-mulo-orange px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white hover:bg-mulo-orange-dark"
              >
                Log in
              </Link>
            )}
          </div>
        </div>

        <nav className="mt-2 flex items-baseline gap-4 sm:hidden">
          <Link href="/search" className={navLink}>
            Search
          </Link>
          <Link href="/people" className={navLink}>
            People
          </Link>
        </nav>
      </div>
    </header>
  );
}
