import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, bio")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">
        {profile ? "Edit your profile" : "Set up your profile"}
      </h1>

      {message && (
        <p className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <form action={saveProfile} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Username
          <input
            name="username"
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_]+"
            title="Letters, numbers, and underscores only"
            defaultValue={profile?.username ?? ""}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Display name
          <input
            name="display_name"
            defaultValue={profile?.display_name ?? ""}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Bio
          <textarea
            name="bio"
            rows={3}
            defaultValue={profile?.bio ?? ""}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          className="rounded bg-black px-3 py-2 text-white"
        >
          Save
        </button>
      </form>
    </div>
  );
}
