import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/redirects";
import AuthForm from "./AuthForm";

export const metadata: Metadata = { title: "Log in" };

/** Why somebody was sent here, when it wasn't their own idea. */
const NOTICES = {
  "link-expired":
    "That link has expired, was already used, or was opened in a different browser from the one you signed up in. If you've already confirmed your email, just log in below.",
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; notice?: string }>;
}) {
  const { mode, next: requested, notice } = await searchParams;
  const next = safeRedirectPath(requested) ?? "/";
  const user = await getCurrentUser();

  // Already signed in — no reason to show a login form.
  if (user) redirect(next);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <AuthForm
        initialMode={mode === "signup" ? "signup" : "login"}
        next={next}
        notice={
          notice && Object.hasOwn(NOTICES, notice)
            ? NOTICES[notice as keyof typeof NOTICES]
            : undefined
        }
      />
    </div>
  );
}
