"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { changeEmail, changePassword, deleteAccount, type AccountState } from "./actions";
import { buttonClass, Field, fieldClass, Notice } from "@/components/ui";

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

export function PasswordSection() {
  const [state, action] = useActionState<AccountState, FormData>(changePassword, {});

  return (
    <Section
      title="Password"
      blurb="You'll stay logged in on this device. Anywhere else stays signed in too."
    >
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="info">{state.message}</Notice>}
      <form action={action} className="flex flex-col gap-3">
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

export function EmailSection({ current }: { current: string }) {
  const [state, action] = useActionState<AccountState, FormData>(changeEmail, {});

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

export function DeleteSection() {
  const [state, action] = useActionState<AccountState, FormData>(deleteAccount, {});
  const [open, setOpen] = useState(false);

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
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            Worth taking a copy of your scores first — the button above saves them as a file.
          </p>
          <Field label="Your password">
            <input
              type="password"
              name="current"
              autoComplete="current-password"
              required
              className={fieldClass}
            />
          </Field>
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
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={buttonClass({ variant: "ghost" })}
            >
              Keep my account
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}
