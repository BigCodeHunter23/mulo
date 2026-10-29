import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listBlocked } from "@/lib/blocks";
import { OAUTH_PROVIDERS } from "@/lib/oauth";
import { getSessionFacts } from "@/lib/session-facts";
import { diaryHref } from "@/lib/diary-shared";
import { getEditableProfile } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import BlockedList from "@/components/BlockedList";
import { DiaryVisibilitySwitch } from "@/components/diary/DiaryPrivacy";
import { DeleteSection, EmailSection, PasswordSection, type AccountKind } from "./AccountForms";

export const metadata: Metadata = { title: "Account" };

/** Whether your diary is public; null before migration 0025, when there's no diary. */
async function diaryPublic(userId: string): Promise<boolean | null> {
  const { data, error } = await (
    await createClient()
  )
    .from("profiles")
    .select("diary_public")
    .eq("id", userId)
    .maybeSingle();
  return error ? null : (data?.diary_public ?? true);
}

export default async function AccountPage() {
  const user = await requireUser("/profile/account");
  const [blocked, facts, diary, profile] = await Promise.all([
    listBlocked(),
    getSessionFacts(),
    diaryPublic(user.id),
    getEditableProfile(user.id),
  ]);
  // How it signs in decides what proves it's them: the password, or for an
  // account without one, a sign-in in the last few minutes with Apple or Google.
  const account: AccountKind = {
    hasPassword: facts.hasPassword,
    freshSignIn: facts.freshSignIn,
    confirmWith: OAUTH_PROVIDERS.find((provider) => facts.signInMethods.includes(provider)) ?? null,
  };

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-20 pt-12 sm:px-6">
      <div className="mb-8">
        <Link
          href="/profile"
          className="text-sm text-text-secondary transition-colors hover:text-text"
        >
          ← Edit profile
        </Link>
        <h1 className="display mt-3 text-3xl text-text">Account</h1>
        <p className="mt-2 text-sm text-text-secondary">
          How you log in, a copy of what you&rsquo;ve rated, and the way out.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <PasswordSection account={account} />
        <EmailSection current={user.email ?? "this account"} account={account} />

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="display-sm text-lg text-text">
            {profile?.username ? (
              <Link
                href={diaryHref(profile.username)}
                className="transition-colors hover:text-accent"
              >
                Your diary
              </Link>
            ) : (
              "Your diary"
            )}
          </h2>
          <div className="mt-2">
            {diary === null ? (
              <p className="text-sm text-text-secondary">The diary isn&rsquo;t available yet.</p>
            ) : (
              <DiaryVisibilitySwitch isPublic={diary} />
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="display-sm text-lg text-text">Your data</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Everything you&rsquo;ve scored and written, as one file. Yours to keep.
          </p>
          {/* A plain link rather than an action: the browser saves the file. */}
          <a
            href="/profile/account/export"
            download
            className="mt-4 inline-flex h-11 items-center rounded-lg border border-border-strong bg-surface-raised px-5 text-sm font-medium text-text transition-colors hover:bg-surface-hover sm:h-10 sm:px-4"
          >
            Download my data
          </a>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="display-sm text-lg text-text">Blocked people</h2>
          <p className="mt-1 mb-4 text-sm text-text-secondary">
            Neither of you sees the other&rsquo;s scores, reviews or profile.
          </p>
          <BlockedList people={blocked} />
        </section>

        <DeleteSection account={account} />
      </div>
    </main>
  );
}
