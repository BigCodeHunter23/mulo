import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { buttonClass } from "@/components/ui";
import ProfileForm from "./ProfileForm";

export const metadata: Metadata = { title: "Edit profile" };

export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url, bio")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-20 pt-12 sm:px-6">
      <ProfileForm profile={profile} />

      {/* The header only has room for Log out on wide screens. */}
      <form action={logout} className="mt-12 border-t border-border pt-6">
        <button type="submit" className={buttonClass({ variant: "secondary" })}>
          Log out
        </button>
      </form>
    </main>
  );
}
