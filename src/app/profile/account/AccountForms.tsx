"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeEmail,
  changePassword,
  deleteAccount,
  setPassword,
  type AccountState,
} from "./actions";
import { continueWith, type AuthState } from "@/app/login/actions";
import type { OAUTH_PROVIDERS } from "@/lib/oauth";
import { buttonClass, Field, fieldClass, Notice } from "@/components/ui";

/** How this account signs in, as far as the forms on this page care. */
export type AccountKind = {
  hasPassword: boolean;
  /** Signed in within the last few minutes, which stands in for a password. */
  freshSignIn: boolean;
  /** What an account without a password signs in again with, to confirm it's them. */
  confirmWith: (typeof OAUTH_PROVIDERS)[number] | null;
};

const PROVIDER_NAMES = { apple: "Apple", google: "Google" } as const;

function Submit({
  label,
  busy,
  variant = "secondary",
}: {
  label: string;
  busy: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        variant === "danger"
          ? "h-11 rounded-lg border border-score-you/40 bg-score-you/10 px-4 text-sm font-semibold text-error-soft transition-colors hover:bg-score-you/20 disabled:opacity-60"
          : buttonClass({ variant })
      }
    >
      {pending ? busy : label}
    </button>
  );
}

/** One titled block, so each thing on this page reads as its own job. */
function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="display-sm text-lg text-text">{title}</h2>
      <p className="mt-1 text-sm text-text-secondary">{blurb}</p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

/**
 * For an account without a password: sign in again with Apple or Google,
 * which comes back here able to make the change for the next few minutes.
 */
function ConfirmItsYou({ provider }: { provider: AccountKind["confirmWith"] }) {
  const [state, action] = useActionState<AuthState, FormData>(continueWith, {});

  if (!provider) {
    return (
      <p className="text-sm text-text-secondary">
        First, confirm it&rsquo;s you: log out, log in again, and come back here.
      </p>
    );
  }
  return (
    <>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <p className="text-sm text-text-secondary">
        First, confirm it&rsquo;s you by signing in with {PROVIDER_NAMES[provider]} again.
      </p>
      <form action={action}>
        <input type="hidden" name="provider" value={provider} />
        <input type="hidden" name="next" value="/profile/account" />
        {/* Apple allows only its own wording on its sign-in buttons. */}
        <Submit label={`Continue with ${PROVIDER_NAMES[provider]}`} busy="Opening…" />
      </form>
    </>
  );
}

export function PasswordSection({ account }: { account: AccountKind }) {
  const [changed, change] = useActionState<AccountState, FormData>(changePassword, {});
  // Kept here rather than in a section of its own, so "Password set" stays
  // on screen when the page turns this into the usual change form.
  const [set, setFirst] = useActionState<AccountState, FormData>(setPassword, {});
  const notices = [set, changed].map((state, index) => (
    <div key={index} className="contents">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="info">{state.message}</Notice>}
    </div>
  ));

  if (!account.hasPassword) {
    const from = account.confirmWith ? PROVIDER_NAMES[account.confirmWith] : "another account";
    return (
      <Section
        title="Set a password"
        blurb={`You log in with ${from}. A password lets you log in with your email too.`}
      >
        {notices}
        {account.freshSignIn ? (
          <form action={setFirst} className="flex flex-col gap-3">
            <Field label="New password" hint="At least 6 characters.">
              <input
                type="password"
                name="next"
                autoComplete="new-password"
                required
                className={fieldClass}
              />
            </Field>
            <div>
              <Submit label="Set password" busy="Setting…" />
            </div>
          </form>
        ) : (
          <ConfirmItsYou provider={account.confirmWith} />
        )}
      </Section>
    );
  }

  return (
    <Section
      title="Password"
      blurb="You'll stay logged in on this device. Anywhere else stays signed in too."
    >
      {notices}
      <form action={change} className="flex flex-col gap-3">
        <Field label="Current password">
          <input
            type="password"
            name="current"
            autoComplete="current-password"
            required
            className={fieldClass}
          />
        </Field>
        <Field label="New password" hint="At least 6 characters.">
          <input
            type="password"
            name="next"
            autoComplete="new-password"
            required
            className={fieldClass}
          />
        </Field>
        <div>
          <Submit label="Change password" busy="Changing…" />
        </div>
      </form>
    </Section>
  );
}

export function EmailSection({ current, account }: { current: string; account: AccountKind }) {
  const [state, action] = useActionState<AccountState, FormData>(changeEmail, {});

  if (!account.hasPassword) {
    const from = account.confirmWith
      ? `From your ${PROVIDER_NAMES[account.confirmWith]} account. `
      : "";
    return (
      <Section title="Email" blurb={`${from}Set a password to change it.`}>
        <p className="break-all text-sm text-text">{current}</p>
      </Section>
    );
  }

  return (
    <Section
      title="Email"
      blurb={`You log in with ${current}. Changing it sends a link to the new address; nothing changes until you follow it.`}
    >
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="info">{state.message}</Notice>}
      <form action={action} className="flex flex-col gap-3">
        <Field label="New email">
          <input type="email" name="email" autoComplete="email" required className={fieldClass} />
        </Field>
        <Field label="Current password">
          <input
            type="password"
            name="current"
            autoComplete="current-password"
            required
            className={fieldClass}
          />
        </Field>
        <div>
          <Submit label="Send the link" busy="Sending…" />
        </div>
      </form>
    </Section>
  );
}

export function DeleteSection({ account }: { account: AccountKind }) {
  const [state, action] = useActionState<AccountState, FormData>(deleteAccount, {});
  const [open, setOpen] = useState(false);
  const keep = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className={buttonClass({ variant: "ghost" })}
    >
      Keep my account
    </button>
  );

  return (
    <Section
      title="Delete account"
      blurb="Your profile, every score and review, your lists and who you follow. All of it goes, and it can't be undone."
    >
      {state.error && <Notice tone="error">{state.error}</Notice>}

      {!open ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm font-medium text-error-soft underline-offset-4 hover:underline"
          >
            I want to delete my account
          </button>
        </div>
      ) : !account.hasPassword && !account.freshSignIn ? (
        <>
          <ConfirmItsYou provider={account.confirmWith} />
          <div>{keep}</div>
        </>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            Worth taking a copy of your scores first — the button above saves them as a file.
          </p>
          {account.hasPassword && (
            <Field label="Your password">
              <input
                type="password"
                name="current"
                autoComplete="current-password"
                required
                className={fieldClass}
              />
            </Field>
          )}
          <Field label="Type DELETE to confirm">
            <input
              type="text"
              name="confirm"
              autoComplete="off"
              autoCapitalize="characters"
              required
              className={fieldClass}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Submit label="Delete everything" busy="Deleting…" variant="danger" />
            {keep}
          </div>
        </form>
      )}
    </Section>
  );
}
