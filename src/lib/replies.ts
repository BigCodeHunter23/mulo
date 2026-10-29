import "server-only";
import type { ThreadKind } from "@/lib/replies-shared";
import { isMissingTable, logQueryError } from "@/lib/supabase/errors";
import { readAll } from "@/lib/supabase/read-all";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * Replies on reviews and takes (migration 0024). Everything here is read
 * through the visitor's own session, so row-level security leaves out
 * anybody blocked either way, and signed out there are no replies to read.
 * Writes are in `src/app/replies/actions.ts`.
 */

/** Which column of `replies` points at each kind of thread. */
export const REPLY_COLUMNS = {
  album: "rating_id",
  artist: "artist_rating_id",
  take: "versus_take_id",
} as const satisfies Record<ThreadKind, string>;

/** `.in()` puts every id in the address, so long lists go this many at a time. */
const CHUNK = 100;

/**
 * How many replies each review or take has: a read per hundred ids, however
 * many there are. Signed out there's nothing to count, and before migration
 * 0024 runs every count is 0.
 */
export async function getReplyCounts(
  kind: ThreadKind,
  ids: number[],
): Promise<Record<number, number>> {
  const counts: Record<number, number> = {};
  for (const id of ids) counts[id] = 0;
  if (ids.length === 0) return counts;
  if (!(await getCurrentUser())) return counts;

  const supabase = await createClient();
  const column = REPLY_COLUMNS[kind];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await readAll((from, to) =>
      supabase
        .from("replies")
        .select(`id, ${column}`)
        .in(column, chunk)
        .order("id")
        .range(from, to),
    );
    if (error) {
      if (!isMissingTable(error)) logQueryError("replies", error);
      return counts;
    }
    // The column changes with the kind, which the typed query builder can't
    // follow, so the row's shape is spelled out here.
    for (const row of data as unknown as Partial<Record<typeof column, number | null>>[]) {
      const id = row[column];
      if (typeof id === "number" && id in counts) counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}
