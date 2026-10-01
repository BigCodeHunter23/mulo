import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { consumeInviteCookie } from "@/lib/invites";
import { loginPath, safeRedirectPath } from "@/lib/redirects";

const OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;

const params = z.object({
  code: z.string().min(1).max(512).optional(),
  token_hash: z.string().min(1).max(512).optional(),
  type: z.enum(OTP_TYPES).optional(),
});

/**
 * Where links in Supabase's emails land (sign-up confirmation, password
 * reset).
 *
 * Supabase hands the session over in one of two shapes depending on the email
 * template: a one-time `code` to exchange (its default template), or a
 * `token_hash` to verify (a customised template). Accept both, so a template
 * change on the dashboard can't silently break the link.
 */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const next = safeRedirectPath(search.get("next")) ?? "/";
  const parsed = params.safeParse({
    code: search.get("code") ?? undefined,
    token_hash: search.get("token_hash") ?? undefined,
    type: search.get("type") ?? undefined,
  });

  if (parsed.success) {
    const { code, token_hash, type } = parsed.data;
    const supabase = await createClient();

    const result = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : token_hash && type
        ? await supabase.auth.verifyOtp({ type, token_hash })
        : null;

    const user = result && !result.error ? result.data.user : null;
    if (user) {
      // A confirmed sign-up that arrived through somebody's invite link.
      await consumeInviteCookie(user.id);
      redirect(next);
    }
  }

  // Expired, already used, or (for the default template) opened in a
  // different browser from the one that asked for it. Supabase has usually
  // confirmed the address by now even so, so logging in is the way on.
  if (next.startsWith("/auth/update-password")) redirect("/auth/reset?expired=1");
  const login = loginPath(next);
  redirect(`${login}${login.includes("?") ? "&" : "?"}notice=link-expired`);
}
