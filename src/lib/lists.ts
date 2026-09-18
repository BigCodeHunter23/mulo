import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Lists: people's own lists of albums ("Best of 2016", "Sunday morning",
 * "Top 10 debuts"), ranked or not, each album with an optional short note.
 * Tables from migration 0015; order lives in `list_items.position`, kept
 * running 1, 2, 3… by the actions in `src/app/lists/actions.ts`.
 */

export const LIST_LIMIT = 100;

export type ListSummary = {
  id: number;
  title: string;
  description: string | null;
  ranked: boolean;
  updatedAt: string;
  count: number;
  /** The first few covers, for a thumbnail. */
  covers: string[];
  owner: { username: string; name: string; avatarUrl: string | null };
};

export type ListItem = {
  mbid: string;
  position: number;
  note: string | null;
  title: string;
  artist: string | null;
  cover: string | null;
  year: string | null;
};

export type ListDetail = Omit<ListSummary, "count" | "covers"> & {
  ownerId: string;
  items: ListItem[];
};

type ProfileRow = { username: string; display_name: string | null; avatar_url: string | null };

type SummaryRow = {
  id: number;
  title: string;
  description: string | null;
  ranked: boolean;
  updated_at: string;
  profiles: ProfileRow | null;
  list_items: {
    position: number;
    releases: { cover_art_url: string | null } | null;
  }[];
};

const SUMMARY = `
  id, title, description, ranked, updated_at,
  profiles ( username, display_name, avatar_url ),
  list_items ( position, releases ( cover_art_url ) )
`;

function owner(profile: ProfileRow | null) {
  return {
    username: profile?.username ?? "unknown",
    name: profile?.display_name || profile?.username || "Unknown",
    avatarUrl: profile?.avatar_url ?? null,
  };
}

function summarise(row: SummaryRow): ListSummary {
  const items = [...row.list_items].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    ranked: row.ranked,
    updatedAt: row.updated_at,
    count: items.length,
    covers: items.flatMap((item) => (item.releases?.cover_art_url ? [item.releases.cover_art_url] : [])).slice(0, 4),
    owner: owner(row.profiles),
  };
}

/** Somebody's lists, most recently changed first. */
export async function getUserLists(userId: string): Promise<ListSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lists")
    .select(SUMMARY)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as unknown as SummaryRow[]).map(summarise);
}

/** Lists from everyone, freshest first, skipping empty ones. */
export async function getRecentLists(limit = 24): Promise<ListSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lists")
    .select(SUMMARY)
    .order("updated_at", { ascending: false })
    .limit(limit * 2);
  return ((data ?? []) as unknown as SummaryRow[])
    .map(summarise)
    .filter((list) => list.count > 0)
    .slice(0, limit);
}

/** Lists that include an album, for the foot of its page. */
export async function getListsWithAlbum(releaseMbid: string, limit = 6): Promise<ListSummary[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("list_items")
    .select("list_id")
    .eq("release_mbid", releaseMbid)
    .limit(200);
  const ids = [...new Set(((rows ?? []) as { list_id: number }[]).map((r) => r.list_id))];
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("lists")
    .select(SUMMARY)
    .in("id", ids)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as SummaryRow[]).map(summarise);
}

/** One list with all its albums, in order. */
export async function getList(id: number): Promise<ListDetail | null> {
  if (!Number.isSafeInteger(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("lists")
    .select(
      `id, user_id, title, description, ranked, updated_at,
       profiles ( username, display_name, avatar_url ),
       list_items ( release_mbid, position, note,
         releases ( title, artist_credit, cover_art_url, release_date ) )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as {
    id: number;
    user_id: string;
    title: string;
    description: string | null;
    ranked: boolean;
    updated_at: string;
    profiles: ProfileRow | null;
    list_items: {
      release_mbid: string;
      position: number;
      note: string | null;
      releases: {
        title: string;
        artist_credit: string | null;
        cover_art_url: string | null;
        release_date: string | null;
      } | null;
    }[];
  };

  return {
    id: row.id,
    ownerId: row.user_id,
    title: row.title,
    description: row.description,
    ranked: row.ranked,
    updatedAt: row.updated_at,
    owner: owner(row.profiles),
    items: row.list_items
      .filter((item) => item.releases)
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        mbid: item.release_mbid,
        position: item.position,
        note: item.note,
        title: item.releases!.title,
        artist: item.releases!.artist_credit,
        cover: item.releases!.cover_art_url,
        year: item.releases!.release_date?.slice(0, 4) ?? null,
      })),
  };
}

/** The signed-in person's lists, marking which already hold an album. */
export async function getMyListsFor(
  userId: string,
  releaseMbid: string,
): Promise<{ id: number; title: string; has: boolean; full: boolean }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lists")
    .select("id, title, list_items ( release_mbid )")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as unknown as { id: number; title: string; list_items: { release_mbid: string }[] }[]).map(
    (list) => ({
      id: list.id,
      title: list.title,
      has: list.list_items.some((item) => item.release_mbid === releaseMbid),
      full: list.list_items.length >= LIST_LIMIT,
    }),
  );
}
