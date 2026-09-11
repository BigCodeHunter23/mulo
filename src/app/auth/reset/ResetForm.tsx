"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestReset, type ResetState } from "./actions";
import { buttonClass, Field, fieldClass, Notice } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass()} w-full`}
    >
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}

export default function ResetForm({ expired }: { expired: boolean }) {
  const [state, formAction] = useActionState<ResetState, FormData>(
    requestReset,
    {},
  );

  const showExpired = expired && !state.message && !state.error;

  return (
    <div className="flex flex-col gap-7">
      <div className="text-center">
        <h1 className="display text-3xl text-text">Reset your password</h1>
        <p className="mt-2 text-sm text-text-secondary">
          We&rsquo;ll email you a link to choose a new one.
        </p>
      </div>

      {showExpired && (
        <Notice tone="error">
          That link has expired, was already used, or was opened in a
          different browser from the one you requested it in. Send yourself a
          new one below.
        </Notice>
      )}
      {state.message && <Notice tone="info">{state.message}</Notice>}
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <form action={formAction} className="flex flex-col gap-5">
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className={fieldClass}
          />
        </Field>
        <SubmitButton />
      </form>

      <Link
        href="/login"
        className="text-center text-sm text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
      >
        Back to log in
      </Link>
    </div>
  );
}
