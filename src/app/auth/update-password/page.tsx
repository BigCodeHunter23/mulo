"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updatePassword, type UpdatePasswordState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
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
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Choose a new password</h1>

      {state.error && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-900">
          <p>{state.error}</p>
          <Link href="/auth/reset" className="mt-1 inline-block underline">
            Request a new link
          </Link>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Confirm new password
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <SubmitButton />
      </form>
    </div>
  );
}
