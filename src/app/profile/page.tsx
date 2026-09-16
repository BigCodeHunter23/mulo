import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getRaisedOn } from "@/lib/raised-on";
import { logout } from "@/app/login/actions";
import { buttonClass } from "@/components/ui";
import ProfileForm from "./ProfileForm";

export const metadata: Metadata = { title: "Edit profile" };

export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: profile }, raisedOn] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, avatar_url, bio")
      .eq("id", user.id)
      .maybeSingle(),
    getRaisedOn(user.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-20 pt-12 sm:px-6">
      <ProfileForm profile={profile} />

      {profile && (
        <Link
          href="/profile/raised-on"
          className="mt-10 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-raised"
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium uppercase tracking-wider text-text-secondary">
              Raised on
            </span>
            <span className="mt-1 block truncate text-sm text-text">
              {raisedOn ? raisedOn.album.title : "Pick the record you grew up on"}
            </span>
          </span>
          <span className="shrink-0 text-sm text-accent">{raisedOn ? "Change" : "Pick"} →</span>
        </Link>
      )}

      {/* The header only has room for Log out on wide screens. */}
      <form action={logout} className="mt-12 border-t border-border pt-6">
        <button type="submit" className={buttonClass({ variant: "secondary" })}>
          Log out
        </button>
      </form>
    </main>
  );
}
