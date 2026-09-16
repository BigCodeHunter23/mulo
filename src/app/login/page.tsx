import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import AuthForm from "./AuthForm";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const user = await getCurrentUser();

  // Already signed in — no reason to show a login form.
  if (user) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <AuthForm initialMode={mode === "signup" ? "signup" : "login"} />
    </div>
  );
}
