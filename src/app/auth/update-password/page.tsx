"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updatePassword, type UpdatePasswordState } from "./actions";
import { buttonClass, Field, fieldClass, Notice } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass()} w-full`}
    >
      {pending ? "Saving…" : "Set new password"}
    </button>
  );
}

export default function UpdatePasswordPage() {
  const [state, formAction] = useActionState<UpdatePasswordState, FormData>(
    updatePassword,
    {},
  );

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 px-4 py-12">
      <div className="text-center">
        <h1 className="display text-3xl text-text">Choose a new password</h1>
        <p className="mt-2 text-sm text-text-secondary">
          You&rsquo;ll stay logged in once it&rsquo;s saved.
        </p>
      </div>

      {state.error && (
        <div className="flex flex-col gap-2">
          <Notice tone="error">{state.error}</Notice>
          {state.expired && (
            <Link
              href="/auth/reset"
              className="text-center text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              Request a new link
            </Link>
          )}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-5">
        <Field label="New password" hint="At least 6 characters.">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            className={fieldClass}
          />
        </Field>

        <Field label="Confirm new password">
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            className={fieldClass}
          />
        </Field>

        <SubmitButton />
      </form>
    </main>
  );
}
