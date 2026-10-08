import "server-only";
import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { logQueryError } from "@/lib/supabase/errors";

/**
 * Blocking, from the reading side.
 *
 * A block hides both ways (migration 0020), so every list of other people's
 * doings asks `hiddenPeople()` first. One lookup per request, kept by React's
 * cache, because a page shows the feed, an album's reviews and a people list
 * all at once.
 *
 * Until the migration runs, nobody is hidden and the site behaves as it did.
 */

/** Ids of everybody the signed-in person shouldn't see, and who shouldn't see them. */
export const hiddenPeople = cache(async (): Promise<Set<string>> => {
  const user = await getCurrentUser();
  if (!user) return new Set();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hidden_profiles", { p_user: user.id });
  if (error) {
    logQueryError("blocks", error, "0020");
    return new Set();
  }

  return new Set((data ?? []).flatMap((row) => (row.id ? [row.id] : [])));
});

/**
 * The same ids written the way PostgREST wants them for `.not("user_id", "in", …)`,
 * or null when there's nobody to leave out.
 */
export async function hiddenFilter(): Promise<string | null> {
  const hidden = await hiddenPeople();
  return hidden.size === 0 ? null : `(${[...hidden].join(",")})`;
}

/** Drops anything by somebody hidden, for lists already fetched. */
export async function withoutHidden<T>(rows: T[], whose: (row: T) => string): Promise<T[]> {
  const hidden = await hiddenPeople();
  if (hidden.size === 0) return rows;
  return rows.filter((row) => !hidden.has(whose(row)));
}

/** Whether this person and the viewer have blocked each other either way. */
export async function isHidden(userId: string): Promise<boolean> {
  return (await hiddenPeople()).has(userId);
}

export type BlockedPerson = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Who the signed-in person has blocked, for the account page. */
export async function listBlocked(): Promise<BlockedPerson[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id, profiles!blocks_blocked_id_fkey ( username, display_name, avatar_url )")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    logQueryError("blocks", error, "0020");
    return [];
  }

  return (data ?? []).flatMap((row) =>
    row.profiles?.username
      ? [
          {
            id: row.blocked_id,
            username: row.profiles.username,
            display_name: row.profiles.display_name,
            avatar_url: row.profiles.avatar_url,
          },
        ]
      : [],
  );
}
