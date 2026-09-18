"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { RATING_TABLES, type RatingKind } from "@/lib/rating-kinds";
import { getBadges } from "@/lib/badges";
import { getCrowd } from "@/lib/ratings";
import { isMilestone, milestonePath } from "@/lib/milestones";

export type RatingResult =
  | {
      ok: true;
      /**
       * Every badge this person now holds, sent back with each saved score.
       * The browser keeps the last list it saw, so anything here that was not
       * there before has just been unlocked and is worth making a fuss of.
       * Badges stay worked out from ratings rather than stored, so this can
       * never drift from the truth.
       */
      badges?: string[];
      /**
       * What everybody else gave the same thing, so a score far from the crowd
       * can be spotted and the person invited to say why.
       */
      crowd?: { average: number; count: number };
      /**
       * Set when this score was somebody's tenth, hundredth (and so on) album,
       * with the share page to celebrate it on.
       */
      milestone?: { count: number; url: string };
    }
  | {
      ok: false;
      error: string;
      needsLogin?: boolean;
      needsProfile?: boolean;
    };

type DbError = { code?: string; message: string; details?: string | null };

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLURAL: Record<RatingKind, string> = {
  album: "albums",
  artist: "artists",
  song: "songs",
};

const TRY_AGAIN: RatingResult = {
  ok: false,
  error: "Couldn't save that. Please try again.",
};

function failure(error: DbError): RatingResult {
  // Ratings belong to a profile, so an account without a username yet can't
  // save one. Say so plainly rather than showing a database error.
  if (
    error.code === "23503" &&
    `${error.details ?? ""} ${error.message}`.includes("profiles")
  ) {
    return {
      ok: false,
      error: "Pick a username before rating.",
      needsProfile: true,
    };
  }
  return TRY_AGAIN;
}

/**
 * These arrive straight from the browser, so check them: a known kind, real
 * MusicBrainz ids, and for a song, the album it was rated on.
 */
function valid(kind: RatingKind, mbid: string, releaseMbid?: string) {
  if (!Object.hasOwn(RATING_TABLES, kind) || !MBID.test(mbid)) return false;
  return kind !== "song" || MBID.test(releaseMbid ?? "");
}

/** Refresh the page the rating was made on, and "My ratings". */
function refresh(kind: RatingKind, mbid: string, releaseMbid?: string) {
  revalidatePath(
    kind === "artist" ? `/artist/${mbid}` : `/album/${releaseMbid ?? mbid}`,
  );
  revalidatePath("/ratings");
}

/**
 * Saves a score the moment it's tapped, leaving any review alone. A song is
 * rated on an album page, and that album is kept with the rating for its
 * cover and for grouping in the feed.
 */
export async function rate(
  kind: RatingKind,
  mbid: string,
  score: number,
  releaseMbid?: string,
): Promise<RatingResult> {
  if (!valid(kind, mbid, releaseMbid)) return TRY_AGAIN;

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: `Log in to rate ${PLURAL[kind]}.`, needsLogin: true };
  }

  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return { ok: false, error: "Scores run from 1 to 10." };
  }

  const { table, column } = RATING_TABLES[kind];
  const supabase = await createClient();
  const { error } = await supabase.from(table).upsert(
    {
      user_id: user.id,
      [column]: mbid,
      score,
      ...(kind === "song" ? { release_mbid: releaseMbid } : {}),
    },
    { onConflict: `user_id,${column}` },
  );

  if (error) return failure(error);

  refresh(kind, mbid, releaseMbid);

  // A score is the only thing that can earn a badge, so this is the one place
  // worth working them out. If that fails the rating still saved: a missed
  // celebration is never worth losing somebody's score over.
  let badges: string[] | undefined;
  try {
    badges = (await getBadges(user.id)).map((badge) => badge.slug);
  } catch {
    badges = undefined;
  }

  // Everybody else's scores for the same thing, starting score included, so
  // a score far from the page's "Everyone" number can be called a hot take.
  let crowd: { average: number; count: number } | undefined;
  try {
    crowd = await getCrowd(kind, mbid, user.id);
  } catch {
    crowd = undefined;
  }

  let milestone: { count: number; url: string } | undefined;
  if (kind === "album") {
    try {
      milestone = await reachedMilestone(user.id, mbid);
    } catch {
      milestone = undefined;
    }
  }

  return { ok: true, badges, crowd, milestone };
}

/**
 * Whether the album just rated took somebody to a milestone. Only a fresh
 * rating counts, not a changed score: the trigger that keeps `updated_at`
 * current means a row that has never been changed still has both times equal.
 */
async function reachedMilestone(userId: string, mbid: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("ratings")
    .select("release_mbid", { count: "exact", head: true })
    .eq("user_id", userId);
  if (!count || !isMilestone(count)) return undefined;

  const [{ data: row }, { data: profile }] = await Promise.all([
    supabase
      .from("ratings")
      .select("created_at, updated_at")
      .eq("user_id", userId)
      .eq("release_mbid", mbid)
      .maybeSingle(),
    supabase.from("profiles").select("username").eq("id", userId).maybeSingle(),
  ]);
  if (!row || !profile || row.created_at !== row.updated_at) return undefined;

  return { count, url: milestonePath(String(profile.username), count) };
}

/** A review hangs off a rating, so there has to be a score first. */
export async function saveReview(
  kind: "album" | "artist",
  mbid: string,
  review: string,
): Promise<RatingResult> {
  if ((kind !== "album" && kind !== "artist") || !valid(kind, mbid)) {
    return TRY_AGAIN;
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Log in to write a review.", needsLogin: true };
  }

  const text = String(review).trim().slice(0, 1000);
  const { table, column } = RATING_TABLES[kind];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .update({ review: text || null })
    .eq("user_id", user.id)
    .eq(column, mbid)
    .select("id");

  if (error) return failure(error);
  if (!data || data.length === 0) {
    return { ok: false, error: "Pick a score first, then add your review." };
  }

  refresh(kind, mbid);
  return { ok: true };
}

export async function removeRating(
  kind: RatingKind,
  mbid: string,
  releaseMbid?: string,
): Promise<RatingResult> {
  if (!valid(kind, mbid, releaseMbid)) return TRY_AGAIN;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in first.", needsLogin: true };

  const { table, column } = RATING_TABLES[kind];
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("user_id", user.id)
    .eq(column, mbid);

  if (error) return failure(error);

  refresh(kind, mbid, releaseMbid);
  return { ok: true };
}
