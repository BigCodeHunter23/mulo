"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { login, signup, type AuthState } from "./actions";
import { buttonClass, Field, fieldClass, Notice } from "@/components/ui";

function SubmitButton({ mode }: { mode: "login" | "signup" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass()} w-full`}
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
    <div className="flex flex-col gap-7">
      <div className="text-center">
        <h1 className="display text-3xl text-text">
          {mode === "login" ? "Welcome back" : "Join MULO"}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {mode === "login"
            ? "Log in to rate and review music."
            : "Start rating the music you listen to."}
        </p>
      </div>

      <div className="flex rounded-lg border border-border bg-surface p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-surface-raised text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            {m === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      {state.message && <Notice tone="info">{state.message}</Notice>}
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <form action={formAction} className="flex flex-col gap-5">
        <Field label="Email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={fieldClass}
          />
        </Field>

        <Field
          label="Password"
          hint={mode === "signup" ? "At least 6 characters." : undefined}
        >
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={6}
            className={fieldClass}
          />
        </Field>

        <SubmitButton mode={mode} />
      </form>

      {mode === "login" && (
        <Link
          href="/auth/reset"
          className="text-center text-sm text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
        >
          Forgotten your password?
        </Link>
      )}
    </div>
  );
}
