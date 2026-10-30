"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ArtistFollowResult, ArtistSummary, SaveResult } from "@/lib/app-api";
import { countFollowedArtists, getArtistSuggestions } from "@/lib/artist-follows";
import { ARTISTS_FULL, SUGGESTIONS_MAX } from "@/lib/artist-follows-shared";
import { getCachedArtist } from "@/lib/catalog";
import { allowUser, RateLimitedError, TOO_MANY } from "@/lib/rate-limit";
import { getUsername } from "@/lib/social";
import { logQueryError } from "@/lib/supabase/errors";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { mbidSchema } from "@/lib/validation";

const TRY_AGAIN = "Couldn't update that. Please try again.";
const NOT_FOUND = "We couldn't find that artist.";
const LOG_IN = "Log in to follow artists.";

const several = z.array(mbidSchema).min(1).max(SUGGESTIONS_MAX);

/**
 * What a failed follow tells the person: nothing for one already there, the
 * database's limit (migration 0026's trigger) in words, anything else logged.
 */
function followProblem(error: { code?: string; message: string }): string | null {
  if (error.code === "23505") return null;
  if (error.code === "23514") return ARTISTS_FULL;
  logQueryError("artist follows", error, "0026");
  return TRY_AGAIN;
}

/** Makes sure MULO has the artist, so the follow has something to point at. */
async function ensureArtist(mbid: string): Promise<"ok" | "missing" | "limited"> {
  const supabase = await createClient();
  const { data } = await supabase.from("artists").select("mbid").eq("mbid", mbid).maybeSingle();
  if (data) return "ok";
  try {
    return (await getCachedArtist(mbid)) ? "ok" : "missing";
  } catch (error) {
    if (error instanceof RateLimitedError) return "limited";
    throw error;
  }
}

/** Follows or unfollows an artist; called straight from the button on their page. */
export async function setArtistFollowing(
  mbid: string,
  follow: boolean,
): Promise<ArtistFollowResult> {
  if (!mbidSchema.safeParse(mbid).success || typeof follow !== "boolean") {
    return { ok: false, error: TRY_AGAIN };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: LOG_IN, needsLogin: true };
  if (!(await allowUser("write", user.id))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  if (!follow) {
    const { error } = await supabase
      .from("artist_follows")
      .delete()
      .eq("user_id", user.id)
      .eq("artist_mbid", mbid);
    if (error) return { ok: false, error: followProblem(error) ?? TRY_AGAIN };
    revalidatePath(`/artist/${mbid}`);
    return { ok: true };
  }

  const cached = await ensureArtist(mbid);
  if (cached !== "ok") return { ok: false, error: cached === "limited" ? TOO_MANY : NOT_FOUND };
  const { error } = await supabase
    .from("artist_follows")
    .insert({ user_id: user.id, artist_mbid: mbid });
  const problem = error ? followProblem(error) : null;
  if (problem) return { ok: false, error: problem };

  revalidatePath(`/artist/${mbid}`);
  revalidatePath("/");
  // Their first artist: the page offers the ones they rate highest, once.
  if (!error && (await countFollowedArtists(user.id)) === 1) return { ok: true, first: true };
  return { ok: true };
}

/** Follows several artists at once: the suggestions card's Follow these. */
export async function followArtists(mbids: string[]): Promise<SaveResult> {
  const parsed = several.safeParse(mbids);
  if (!parsed.success) return { ok: false, error: TRY_AGAIN };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: LOG_IN };
  if (!(await allowUser("write", user.id))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  // Only artists MULO has: the card's always are, and anything else isn't worth a lookup here.
  const { data: known, error: readError } = await supabase
    .from("artists")
    .select("mbid")
    .in("mbid", [...new Set(parsed.data)]);
  if (readError) {
    logQueryError("artist follows", readError);
    return { ok: false, error: TRY_AGAIN };
  }
  if (!known || known.length === 0) return { ok: false, error: NOT_FOUND };

  // Those followed already are left out: at the limit, adding them again
  // would otherwise be refused as one too many.
  const { data: followed, error: followedError } = await supabase
    .from("artist_follows")
    .select("artist_mbid")
    .eq("user_id", user.id)
    .in(
      "artist_mbid",
      known.map((artist) => artist.mbid),
    );
  if (followedError) {
    logQueryError("artist follows", followedError, "0026");
    return { ok: false, error: TRY_AGAIN };
  }
  const already = new Set((followed ?? []).map((row) => row.artist_mbid));
  const rows = known
    .filter((artist) => !already.has(artist.mbid))
    .map((artist) => ({ user_id: user.id, artist_mbid: artist.mbid }));
  if (rows.length === 0) return { ok: true };

  const { error } = await supabase
    .from("artist_follows")
    .upsert(rows, { onConflict: "user_id,artist_mbid", ignoreDuplicates: true });
  const problem = error ? followProblem(error) : null;
  if (problem) return { ok: false, error: problem };

  const username = await getUsername(user.id);
  if (username) revalidatePath(`/u/${username}`);
  revalidatePath("/");
  return { ok: true };
}

/**
 * The artists the signed-in person rates highest and doesn't follow yet,
 * for the card an artist's page shows after a first follow.
 */
export async function artistSuggestions(): Promise<ArtistSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  if (!(await allowUser("read", user.id))) return [];
  return getArtistSuggestions();
}
