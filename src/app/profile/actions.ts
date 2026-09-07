"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProfileState = { error?: string; message?: string };

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Uploads with the service role from the server, so the storage bucket needs
 * no client-facing write policy. Returns the public URL, or an error string.
 */
async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ url?: string; error?: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Avatars must be a JPEG, PNG or WebP image." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "That image is over 2MB. Please pick a smaller one." };
  }

  const extension = file.type.split("/")[1].replace("jpeg", "jpg");
  // Overwrite the previous avatar rather than accumulating orphaned files.
  const path = `${userId}/avatar.${extension}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("avatars")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });

  if (error) return { error: `Couldn't upload that image: ${error.message}` };

  const {
    data: { publicUrl },
  } = admin.storage.from("avatars").getPublicUrl(path);

  // Cache-bust, since the path stays the same when someone replaces a photo.
  return { url: `${publicUrl}?v=${Date.now()}` };
}

export async function saveProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const username = String(formData.get("username") ?? "").trim();
  const display_name = String(formData.get("display_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const avatar = formData.get("avatar");

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return {
      error:
        "Usernames must be 3–20 characters, using only letters, numbers and underscores.",
    };
  }

  let avatarUrl: string | undefined;
  if (avatar instanceof File && avatar.size > 0) {
    const result = await uploadAvatar(user.id, avatar);
    if (result.error) return { error: result.error };
    avatarUrl = result.url;
  }

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    username,
    display_name: display_name || null,
    bio: bio || null,
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That username is already taken. Try another." };
    }
    return { error: error.message };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { message: "Profile saved." };
}
