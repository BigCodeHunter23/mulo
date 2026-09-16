"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveProfile, type ProfileState } from "./actions";
import Avatar from "@/components/Avatar";
import AvatarCropper from "@/components/AvatarCropper";
import { buttonClass, Field, fieldClass, Notice } from "@/components/ui";

type Profile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonClass()}>
      {pending ? "Saving…" : "Save profile"}
    </button>
  );
}

export default function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    saveProfile,
    {},
  );

  // A photo waiting to be cropped, then the small cropped version that is
  // actually uploaded, with a preview of it.
  const [picked, setPicked] = useState<File | null>(null);
  const [cropped, setCropped] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  /** Swap in the cropped photo; the original never leaves the device. */
  function submit(formData: FormData) {
    formData.delete("avatar");
    if (cropped) formData.set("avatar", cropped);
    formAction(formData);
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="display text-3xl text-text">
          {profile ? "Edit your profile" : "Set up your profile"}
        </h1>
        {!profile && (
          <p className="mt-2 text-sm text-text-secondary">
            Pick a username so other people can find and follow you.
          </p>
        )}
      </div>

      {state.message && <Notice tone="info">{state.message}</Notice>}
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <form action={submit} className="flex flex-col gap-6">
        {picked ? (
          <AvatarCropper
            file={picked}
            onCancel={() => setPicked(null)}
            onDone={(file, url) => {
              setCropped(file);
              setPreview(url);
              setPicked(null);
            }}
          />
        ) : (
          <div className="flex items-center gap-5">
            <Avatar
              url={preview ?? profile?.avatar_url ?? null}
              name={profile?.display_name || profile?.username || "You"}
              size="xl"
            />

            <div>
              <label
                className={`${buttonClass({ variant: "secondary", size: "sm" })} cursor-pointer`}
              >
                {profile?.avatar_url || preview ? "Change photo" : "Add a photo"}
                {/* No name: the original is cropped first, and only the
                    cropped copy is sent. */}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Clear it so picking the same photo again still works.
                    e.target.value = "";
                    if (file) setPicked(file);
                  }}
                />
              </label>
              <p className="mt-2 text-xs text-text-muted">
                {cropped
                  ? "Looking good. Save your profile to keep it."
                  : "Any photo. You'll crop it to the circle."}
              </p>
            </div>
          </div>
        )}

        <Field label="Username" hint="Letters, numbers and underscores only.">
          <input
            name="username"
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_]+"
            defaultValue={profile?.username ?? ""}
            className={fieldClass}
          />
        </Field>

        <Field label="Display name">
          <input
            name="display_name"
            maxLength={50}
            defaultValue={profile?.display_name ?? ""}
            className={fieldClass}
          />
        </Field>

        <Field label="Bio">
          <textarea
            name="bio"
            rows={3}
            maxLength={300}
            defaultValue={profile?.bio ?? ""}
            className={`${fieldClass} resize-y`}
          />
        </Field>

        <div>
          <SaveButton />
        </div>
      </form>
    </div>
  );
}
