"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveProfile, type ProfileState } from "@/app/profile/actions";
import { buttonClass, Field, fieldClass, Notice } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={`${buttonClass()} w-full`}>
      {pending ? "Saving…" : "Continue"}
    </button>
  );
}

export default function WelcomeProfileForm() {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    saveProfile,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value="/welcome?step=raised" />

      {state.error && <Notice tone="error">{state.error}</Notice>}

      <Field label="Username" hint="Letters, numbers and underscores only.">
        <input
          name="username"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_]+"
          autoComplete="username"
          autoFocus
          className={fieldClass}
        />
      </Field>

      <Field label="Display name" hint="Optional. How your name appears to others.">
        <input name="display_name" maxLength={50} autoComplete="name" className={fieldClass} />
      </Field>

      <SubmitButton />
    </form>
  );
}
