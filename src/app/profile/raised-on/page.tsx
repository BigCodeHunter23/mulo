import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRaisedOn } from "@/lib/raised-on";
import { isRecordAvatar } from "@/lib/record-avatar";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import RaisedOnPicker from "@/components/RaisedOnPicker";

export const metadata: Metadata = { title: "Raised on" };

export default async function RaisedOnPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: profile }, raisedOn] = await Promise.all([
    supabase.from("profiles").select("username, avatar_url").eq("id", user.id).maybeSingle(),
    getRaisedOn(user.id),
  ]);
  if (!profile) redirect("/welcome");

  const hasPhoto = !isRecordAvatar(profile.avatar_url);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <Link
        href={`/u/${profile.username}`}
        className="text-xs text-text-muted transition-colors hover:text-text"
      >
        ← Your profile
      </Link>
      <h1 className="display mt-3 text-3xl text-text">What were you raised on?</h1>
      <p className="mt-2 max-w-xl text-sm text-text-secondary">
        Pick a decade, a scene, then the record that made you. It shows on your
        profile
        {hasPhoto ? "." : ", and it's your picture until you add a photo."}
      </p>

      <div className="mt-8">
        <RaisedOnPicker
          mode="settings"
          hasPhoto={hasPhoto}
          initial={
            raisedOn
              ? {
                  mbid: raisedOn.album.mbid,
                  title: raisedOn.album.title,
                  artist: raisedOn.album.artist,
                  cover: raisedOn.album.cover,
                  era: raisedOn.era?.id ?? null,
                  scene: raisedOn.scene?.id ?? null,
                }
              : null
          }
        />
      </div>
    </main>
  );
}
