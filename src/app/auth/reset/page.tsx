"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestReset, type ResetState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}

export default function ResetPage() {
  const [state, formAction] = useActionState<ResetState, FormData>(
    requestReset,
    {},
  );

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="mt-1 text-sm text-gray-600">
          We&rsquo;ll email you a link to choose a new one.
        </p>
      </div>

      {state.message && (
        <p className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {state.message}
        </p>
      )}
      {state.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <SubmitButton />
      </form>

      <Link href="/login" className="text-sm text-gray-600 underline">
        Back to log in
      </Link>
    </div>
  );
}
