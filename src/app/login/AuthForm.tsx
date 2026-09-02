"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { login, signup, type AuthState } from "./actions";

function SubmitButton({ mode }: { mode: "login" | "signup" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
    >
      {pending
        ? mode === "login"
          ? "Logging in…"
          : "Creating account…"
        : mode === "login"
          ? "Log in"
          : "Create account"}
    </button>
  );
}

export default function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const action = mode === "login" ? login : signup;

  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex rounded border border-gray-300 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 rounded px-3 py-1.5 ${
            mode === "login" ? "bg-black text-white" : "text-gray-600"
          }`}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded px-3 py-1.5 ${
            mode === "signup" ? "bg-black text-white" : "text-gray-600"
          }`}
        >
          Sign up
        </button>
      </div>

      <h1 className="text-2xl font-bold">
        {mode === "login" ? "Log in to MULO" : "Create your MULO account"}
      </h1>

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
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={6}
            className="rounded border border-gray-300 px-3 py-2"
          />
          {mode === "signup" && (
            <span className="text-xs text-gray-500">
              At least 6 characters.
            </span>
          )}
        </label>

        <SubmitButton mode={mode} />
      </form>

      {mode === "login" && (
        <Link
          href="/auth/reset"
          className="text-sm text-gray-600 underline"
        >
          Forgotten your password?
        </Link>
      )}
    </div>
  );
}
