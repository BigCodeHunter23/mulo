import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { DeleteSection, EmailSection, PasswordSection } from "./AccountForms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser("/profile/account");

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
        <PasswordSection />
        <EmailSection current={user.email ?? "this account"} />

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

        <DeleteSection />
      </div>
    </main>
  );
}
