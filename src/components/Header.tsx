import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

export default async function Header() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-lg font-bold">
          MULO
        </Link>
        <Link href="/search" className="text-sm">
          Search
        </Link>
      </div>

      {user ? (
        <div className="flex items-center gap-4 text-sm">
          <Link href="/profile">Edit profile</Link>
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
