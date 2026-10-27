import { appError, appJson, appRoute, SIGN_IN_FIRST, signedInCaller } from "@/lib/app-route";
import { bearerToken } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Ends this device's session, as logging out on the website does: other
 * devices stay logged in. Supabase's /logout only needs the person's own
 * token, so no service role is involved. Answers ok even if Supabase can't be
 * reached, because the app forgets the session either way.
 */
export const POST = appRoute(async () => {
  const token = await bearerToken();
  if (!token) return appError(401, SIGN_IN_FIRST);
  const user = await signedInCaller();
  if (user instanceof Response) return user;

  try {
    const { error } = await createPublicClient().auth.admin.signOut(token, "local");
    if (error) console.error("[app-api] log-out failed:", error.message);
  } catch (error) {
    console.error("[app-api] log-out failed:", error);
  }
  return appJson({ ok: true as const });
});
