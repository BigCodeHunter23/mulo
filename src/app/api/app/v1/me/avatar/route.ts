import type { NextRequest } from "next/server";
import { saveProfile } from "@/app/profile/actions";
import type { AvatarResult } from "@/lib/app-api";
import { appError, appJson, appRoute, BAD_REQUEST, signedInCaller } from "@/lib/app-route";
import { PICK_A_USERNAME } from "@/lib/app-profile";
import { getEditableProfile } from "@/lib/social";

/**
 * A new photo, sent as a form with one `avatar` file. The website's own save
 * does the checking (2MB, JPEG, PNG or WebP judged by its bytes) and the
 * upload; the username and display name go along as they are, and with no
 * bio field the bio is left alone.
 */
export const POST = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;

  let avatar: FormDataEntryValue | null;
  try {
    avatar = (await request.formData()).get("avatar");
  } catch {
    return appError(400, BAD_REQUEST);
  }
  if (!(avatar instanceof File) || avatar.size === 0) return appError(400, BAD_REQUEST);

  const current = await getEditableProfile(user.id);
  if (!current) return appError(404, PICK_A_USERNAME);

  const form = new FormData();
  form.set("username", current.username);
  form.set("display_name", current.display_name ?? "");
  form.set("avatar", avatar);
  const result = await saveProfile({}, form);
  if (result.error) return appJson<AvatarResult>({ ok: false, error: result.error });

  // The address carries a version, so it's read back rather than worked out.
  const saved = await getEditableProfile(user.id);
  return appJson<AvatarResult>({ ok: true, avatarUrl: saved?.avatar_url ?? "" });
});
