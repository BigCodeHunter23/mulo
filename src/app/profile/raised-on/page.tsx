import type { Metadata } from "next";
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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
      <RaisedOnPicker
        mode="settings"
        hasPhoto={!isRecordAvatar(profile.avatar_url)}
        doneHref={`/u/${profile.username}`}
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
    </main>
  );
}
