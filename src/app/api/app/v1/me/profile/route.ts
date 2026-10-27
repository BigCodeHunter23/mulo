import type { NextRequest } from "next/server";
import { z } from "zod";
import { saveProfile } from "@/app/profile/actions";
import type { EditableProfile, SaveResult } from "@/lib/app-api";
import { appError, appJson, appRoute, limitReads, readBody, signedInCaller } from "@/lib/app-route";
import { PICK_A_USERNAME } from "@/lib/app-profile";
import { getRaisedOn } from "@/lib/raised-on";
import { getEditableProfile } from "@/lib/social";

/** The shape only; `saveProfile` checks the values, as it does for the website. */
const profileBody = z.object({
  username: z.string().max(40),
  display_name: z.string().max(100).optional(),
  bio: z.string().max(1000).optional(),
});

/** What the edit screen starts from: the caller's own profile and Raised On. */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);

  const [profile, raisedOn] = await Promise.all([
    getEditableProfile(user.id),
    getRaisedOn(user.id),
  ]);
  if (!profile) return appError(404, PICK_A_USERNAME);
  return appJson<EditableProfile>({ ...profile, raisedOn });
});

/**
 * A username, a display name, and a bio when it's sent: the welcome step
 * sends no bio, so it's left alone. The website's own action does the
 * checking and saving; the photo has its own endpoint, and with no `next` the
 * action doesn't redirect.
 */
export const PUT = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  const body = await readBody(request, profileBody);
  if (body instanceof Response) return body;

  const form = new FormData();
  form.set("username", body.username);
  form.set("display_name", body.display_name ?? "");
  if (body.bio !== undefined) form.set("bio", body.bio);
  const result = await saveProfile({}, form);
  return appJson<SaveResult>(result.error ? { ok: false, error: result.error } : { ok: true });
});
