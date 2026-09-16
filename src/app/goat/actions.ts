"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { PickKind } from "@/lib/top-picks";

export type SaveResult = { ok: true } | { ok: false; error: string };

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TABLES = {
  artist: { table: "top_artists", column: "artist_mbid" },
  album: { table: "top_albums", column: "release_mbid" },
} as const satisfies Record<PickKind, { table: string; column: string }>;

const TRY_AGAIN: SaveResult = {
  ok: false,
  error: "Couldn't save your list. Please try again.",
};

/**
 * Saves the whole ranked list at once: the order is the list, so the old rows
 * go and the new ones take their place, numbered from the top.
 */
export async function saveTopPicks(
  kind: PickKind,
  mbids: string[],
): Promise<SaveResult> {
  if (!Object.hasOwn(TABLES, kind) || !Array.isArray(mbids)) return TRY_AGAIN;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in to save your list." };

  const picks = [...new Set(mbids.filter((mbid) => MBID.test(mbid)))].slice(0, 10);
  const { table, column } = TABLES[kind];
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from(table)
    .delete()
    .eq("user_id", user.id);
  if (clearError) return TRY_AGAIN;

  if (picks.length > 0) {
    const { error } = await supabase.from(table).insert(
      picks.map((mbid, i) => ({
        user_id: user.id,
        position: i + 1,
        [column]: mbid,
      })),
    );
    if (error) return TRY_AGAIN;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  revalidatePath("/goat");
  if (profile?.username) revalidatePath(`/u/${profile.username}`);

  return { ok: true };
}
