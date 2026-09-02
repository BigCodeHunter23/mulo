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

  return (
    <header className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-lg font-bold">
          MULO
        </Link>
        <Link href="/search" className="text-sm">
          Search
        </Link>
        <Link href="/people" className="text-sm">
          People
        </Link>
      </div>

      {user ? (
        <div className="flex items-center gap-4 text-sm">
          <Link href="/ratings">My ratings</Link>
          {profile?.username ? (
            <Link href={`/u/${profile.username}`}>Profile</Link>
          ) : (
            <Link href="/profile">Set up profile</Link>
          )}
          <form action={logout}>
            <button type="submit">Log out</button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-4 text-sm">
          <Link href="/login">Log in</Link>
        </div>
      )}
    </header>
  );
}
