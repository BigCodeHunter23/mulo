"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const username = (formData.get("username") as string).trim();
  const display_name = (formData.get("display_name") as string).trim();
  const bio = (formData.get("bio") as string).trim();

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    username,
    display_name: display_name || null,
    bio: bio || null,
  });

  if (error) {
    redirect(`/profile?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/profile?message=Profile saved.");
}
