import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Only ever send people to a path on this site, never to another domain. */
function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/**
 * Where links in Supabase's emails land (password reset, sign-up
 * confirmation).
 *
 * Supabase hands the session over in one of two shapes depending on the email
 * template: a one-time `code` to exchange (its default template), or a
 * `token_hash` to verify (a customised template). Accept both, so a template
 * change on the dashboard can't silently break the link.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) redirect(next);
  }

  // Expired, already used, or (for the default template) opened in a
  // different browser from the one that asked for it.
  redirect(
    next.startsWith("/auth/update-password") ? "/auth/reset?expired=1" : "/login",
  );
}
