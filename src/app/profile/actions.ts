"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = { error?: string; message?: string };

export async function saveProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const username = String(formData.get("username") ?? "").trim();
  const display_name = String(formData.get("display_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return {
      error:
        "Usernames must be 3–20 characters, using only letters, numbers and underscores.",
    };
  }

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    username,
    display_name: display_name || null,
    bio: bio || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That username is already taken. Try another." };
    }
    return { error: error.message };
  }

  revalidatePath("/profile");
  return { message: "Profile saved." };
}
