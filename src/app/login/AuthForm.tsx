"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { continueWith, login, signup, type AuthState } from "./actions";
import { buttonClass, Field, fieldClass, Notice } from "@/components/ui";

type Mode = "login" | "signup";

function SubmitButton({ mode }: { mode: Mode }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={`${buttonClass()} w-full`}>
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

const SOCIAL_BASE =
  "inline-flex h-11 w-full select-none items-center justify-center gap-2.5 rounded-lg border text-sm font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50";

function AppleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M16.37 1.43c0 1.14-.46 2.22-1.2 3-.8.86-2.1 1.52-3.16 1.43-.13-1.1.41-2.25 1.15-3 .82-.85 2.2-1.48 3.21-1.43zM20.5 17.2c-.55 1.27-.82 1.84-1.53 2.96-1 1.56-2.4 3.5-4.14 3.52-1.55.02-1.95-1-4.05-.99-2.1.01-2.54 1.01-4.09.99-1.74-.02-3.07-1.77-4.07-3.33C-.2 16.1-.5 10.97 1.2 8.3c1.2-1.9 3.1-3.01 4.88-3.01 1.82 0 2.96 1 4.46 1 1.45 0 2.34-1 4.44-1 1.59 0 3.27.87 4.47 2.37-3.93 2.16-3.3 7.77.05 9.54z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Apple first, as its guidelines ask; each is the same size. */
function SocialButtons({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(continueWith, {});

  return (
    <>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          name="provider"
          value="apple"
          disabled={pending}
          className={`${SOCIAL_BASE} border-black bg-black text-white hover:bg-neutral-800`}
        >
          <AppleMark />
          Continue with Apple
        </button>
        <button
          type="submit"
          name="provider"
          value="google"
          disabled={pending}
          className={`${SOCIAL_BASE} border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100`}
        >
          <GoogleMark />
          Continue with Google
        </button>
      </form>
      <div className="flex items-center gap-3 text-xs text-text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}

export default function AuthForm({
  initialMode = "login",
  next = "/",
  notice,
}: {
  initialMode?: Mode;
  /** Where to go once logged in: the page that asked them to log in. */
  next?: string;
  /** Why they were sent here, such as an email link that didn't work. */
  notice?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);

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
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === m ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"
            }`}
          >
            {m === "login" ? "Log in" : "Join"}
          </button>
        ))}
      </div>

      {/* Keyed by mode, so a message from one never lingers on the other. */}
      <AuthPanel key={mode} mode={mode} next={next} notice={notice} />
    </div>
  );
}

function AuthPanel({ mode, next, notice }: { mode: Mode; next: string; notice?: string }) {
  const action = mode === "login" ? login : signup;
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <>
      {notice && !state.message && !state.error && <Notice tone="info">{notice}</Notice>}
      {state.message && <Notice tone="info">{state.message}</Notice>}
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <SocialButtons next={next} />

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="next" value={next} />

        <Field label="Email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className={fieldClass}
          />
        </Field>

        <Field label="Password" hint={mode === "signup" ? "At least 6 characters." : undefined}>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 6 : undefined}
            maxLength={72}
            className={fieldClass}
          />
        </Field>

        <SubmitButton mode={mode} />
      </form>

      {/* Said where somebody is actually agreeing to it, rather than only in
          a footer nobody scrolls to. */}
      {mode === "signup" && (
        <p className="text-center text-xs leading-relaxed text-text-muted">
          Joining means you&rsquo;re happy with the{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-text">
            terms
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-text">
            privacy policy
          </Link>
          .
        </p>
      )}

      {mode === "login" && (
        <Link
          href="/auth/reset"
          className="text-center text-sm text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
        >
          Forgotten your password?
        </Link>
      )}
    </>
  );
}
