import "server-only";
import { getReactions, type ReactionSummary } from "@/lib/reactions";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentUser } from "@/lib/supabase/server";
import type { VersusSideKey } from "@/lib/versus-shared";

export type VersusTake = {
  id: number;
  body: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  /** The side they picked. */
  side: VersusSideKey | null;
  reactions: ReactionSummary;
  mine: boolean;
};

export type Takes = {
  /** False until the takes table exists, so the section can stay hidden. */
  available: boolean;
  takes: VersusTake[];
};

type Row = {
  id: number;
  body: string;
  created_at: string;
  user_id: string;
  profiles: VersusTake["author"];
};

/** Everyone's take on a matchup, the most loved first, with the side each picked. */
export async function getTakes(matchupId: number): Promise<Takes> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("versus_takes")
    .select("id, body, created_at, user_id, profiles!inner ( id, username, display_name, avatar_url )")
    .eq("matchup_id", matchupId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { available: false, takes: [] };

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return { available: true, takes: [] };

  const [{ data: picks }, reactions, user] = await Promise.all([
    supabase
      .from("versus_votes")
      .select("user_id, pick")
      .eq("matchup_id", matchupId)
      .in(
        "user_id",
        rows.map((row) => row.user_id),
      ),
    getReactions(
      "take",
      rows.map((row) => row.id),
    ),
    getCurrentUser(),
  ]);

  const sides = new Map(
    ((picks ?? []) as { user_id: string; pick: VersusSideKey }[]).map((pick) => [
      pick.user_id,
      pick.pick,
    ]),
  );

  const takes = rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: row.profiles,
    side: sides.get(row.user_id) ?? null,
    reactions: reactions[row.id],
    mine: user?.id === row.user_id,
  }));

  // Most loved first; ties keep the newest on top.
  return {
    available: true,
    takes: takes.sort(
      (a, b) =>
        b.reactions.love - b.reactions.dislike - (a.reactions.love - a.reactions.dislike),
    ),
  };
}
