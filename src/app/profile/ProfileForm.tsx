"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveProfile, type ProfileState } from "./actions";

type Profile = {
  username: string;
  display_name: string | null;
  bio: string | null;
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export default function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    saveProfile,
    {},
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">
          {profile ? "Edit your profile" : "Set up your profile"}
        </h1>
        {!profile && (
          <p className="mt-1 text-sm text-gray-600">
            Pick a username so other people can find and follow you.
          </p>
        )}
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
          Username
          <input
            name="username"
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_]+"
            defaultValue={profile?.username ?? ""}
            className="rounded border border-gray-300 px-3 py-2"
          />
          <span className="text-xs text-gray-500">
            Letters, numbers and underscores only.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Display name
          <input
            name="display_name"
            maxLength={50}
            defaultValue={profile?.display_name ?? ""}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Bio
          <textarea
            name="bio"
            rows={3}
            maxLength={300}
            defaultValue={profile?.bio ?? ""}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <SaveButton />
      </form>
    </div>
  );
}
