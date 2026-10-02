"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeRedirectPath } from "@/lib/redirects";
import { field, firstError, textSchema, usernameSchema } from "@/lib/validation";
import { imageTypeOf } from "@/lib/image-type";
import { allowUser, TOO_MANY } from "@/lib/rate-limit";

export type ProfileState = { error?: string; message?: string };

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** The same limits as the form's fields, and as the database (migration 0016). */
const profileInput = z.object({
  username: usernameSchema,
  display_name: textSchema(50, "Keep your name to 50 characters."),
  bio: textSchema(300, "Keep your bio to 300 characters."),
});

/**
 * Uploads with the service role from the server, so the storage bucket needs
 * no client-facing write policy. Returns the public URL, or an error string.
 */
async function uploadAvatar(userId: string, file: File): Promise<{ url?: string; error?: string }> {
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "That image is over 2MB. Please pick a smaller one." };
  }

  // Judge the file by what's in it, not by the type the browser says it is.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = imageTypeOf(bytes);
  if (!type) return { error: "Avatars must be a JPEG, PNG or WebP image." };

  const extension = type.split("/")[1].replace("jpeg", "jpg");
  // Overwrite the previous avatar rather than accumulating orphaned files.
  const path = `${userId}/avatar.${extension}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { contentType: type, upsert: true });

  if (error) {
    console.error("[profile] avatar upload failed:", error.message);
    return { error: "Couldn't upload that image. Please try again." };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("avatars").getPublicUrl(path);

  // Cache-bust, since the path stays the same when someone replaces a photo.
  return { url: `${publicUrl}?v=${Date.now()}` };
}

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You've been logged out. Log in again to save your profile." };

  const input = profileInput.safeParse({
    username: field(formData, "username"),
    display_name: field(formData, "display_name"),
    bio: field(formData, "bio"),
  });
  if (!input.success) return { error: firstError(input.error) };
  if (!(await allowUser("write", user.id))) return { error: TOO_MANY };
  const { username, display_name, bio } = input.data;

  let avatarUrl: string | undefined;
  const avatar = formData.get("avatar");
  if (avatar instanceof File && avatar.size > 0) {
    const result = await uploadAvatar(user.id, avatar);
    if (result.error) return { error: result.error };
    avatarUrl = result.url;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    username,
    display_name: display_name || null,
    // The welcome step has no bio field; don't wipe one on its account.
    ...(formData.has("bio") ? { bio: bio || null } : {}),
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That username is already taken. Try another." };
    }
    console.error("[profile] save failed:", error.code, error.message);
    return { error: "Couldn't save your profile. Please try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout");

  const next = safeRedirectPath(field(formData, "next"));
  if (next) redirect(next);

  return { message: "Profile saved." };
}
