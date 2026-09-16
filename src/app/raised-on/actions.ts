"use server";

import { revalidatePath } from "next/cache";
import { getCachedRelease } from "@/lib/catalog";
import { eraForYear, findScene } from "@/lib/raised-on-shared";
import { isRecordAvatar, recordAvatarPath } from "@/lib/record-avatar";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type RaisedOnResult = { ok: true } | { ok: false; error: string };

/**
 * Saves the record somebody was raised on. It becomes their picture when they
 * have no photo, when their picture is already a record, or when they ask.
 */
export async function saveRaisedOn(input: {
  mbid: string;
  era: string | null;
  scene: string | null;
  useAsPicture: boolean;
}): Promise<RaisedOnResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in first." };
  if (typeof input?.mbid !== "string" || !UUID.test(input.mbid)) {
    return { ok: false, error: "Couldn't save that. Please try again." };
  }

  // An album found through search may not be in the catalogue yet.
  let release;
  try {
    release = await getCachedRelease(input.mbid);
  } catch {
    return { ok: false, error: "Couldn't reach the music database. Try again in a minute." };
  }
  if (!release) return { ok: false, error: "Couldn't find that album. Try another." };

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return { ok: false, error: "Pick a username first." };

  // Keep the scene only if it's real; otherwise place the album by its year.
  const { era, scene } = findScene(input.era, input.scene);
  const year = release.release_date ? Number(release.release_date.slice(0, 4)) : null;
  const eraId = scene ? era!.id : (era?.id ?? eraForYear(year));

  const { error } = await supabase
    .from("profiles")
    .update({
      raised_era: eraId,
      raised_scene: scene?.id ?? null,
      raised_on_mbid: release.mbid,
      ...(input.useAsPicture === true || isRecordAvatar(profile.avatar_url)
        ? { avatar_url: recordAvatarPath(release.mbid) }
        : {}),
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: "Couldn't save that. Please try again." };

  revalidatePath("/", "layout");
  return { ok: true };
}
