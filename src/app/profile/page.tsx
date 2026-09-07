import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url, bio")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-20 pt-12 sm:px-6">
      <ProfileForm profile={profile} />
    </main>
  );
}
