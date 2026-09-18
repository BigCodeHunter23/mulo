"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { LIST_LIMIT } from "@/lib/lists";

/**
 * Everything that changes a list. Row-level security already stops anyone
 * touching a list that isn't theirs; the checks here are for plain answers
 * rather than silent failures.
 */

export type ListResult = { ok: true; id?: number } | { ok: false; error: string };

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRY_AGAIN: ListResult = { ok: false, error: "Couldn't save that. Please try again." };

function clean(text: unknown, max: number) {
  return String(text ?? "").trim().slice(0, max);
}

function refresh(id: number) {
  revalidatePath(`/lists/${id}`);
  revalidatePath("/lists");
}

/** Marks a list as just changed, so it rises to the top of the recent lists. */
async function touch(id: number) {
  const supabase = await createClient();
  await supabase.from("lists").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

async function items(listId: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("list_items")
    .select("release_mbid, position")
    .eq("list_id", listId)
    .order("position");
  return (data ?? []) as { release_mbid: string; position: number }[];
}

/** Rewrites positions as 1, 2, 3… in the given order. */
async function renumber(listId: number, order: string[]) {
  const supabase = await createClient();
  await Promise.all(
    order.map((mbid, i) =>
      supabase
        .from("list_items")
        .update({ position: i + 1 })
        .eq("list_id", listId)
        .eq("release_mbid", mbid),
    ),
  );
}

export async function createList(input: {
  title: string;
  description?: string;
  ranked?: boolean;
  /** An album to start it with, when made from an album page. */
  releaseMbid?: string;
}): Promise<ListResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Log in to make a list." };

  const title = clean(input.title, 80);
  if (!title) return { ok: false, error: "Give your list a name." };
  const description = clean(input.description, 500) || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lists")
    .insert({ user_id: user.id, title, description, ranked: Boolean(input.ranked) })
    .select("id")
    .single();
  if (error || !data) {
    return error?.code === "23503"
      ? { ok: false, error: "Pick a username first, then come back." }
      : TRY_AGAIN;
  }

  const id = Number(data.id);
  if (input.releaseMbid && MBID.test(input.releaseMbid)) {
    await supabase.from("list_items").insert({ list_id: id, release_mbid: input.releaseMbid, position: 1 });
  }
  refresh(id);
  return { ok: true, id };
}

export async function updateList(
  id: number,
  input: { title: string; description?: string; ranked: boolean },
): Promise<ListResult> {
  if (!Number.isSafeInteger(id)) return TRY_AGAIN;
  const title = clean(input.title, 80);
  if (!title) return { ok: false, error: "Give your list a name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lists")
    .update({
      title,
      description: clean(input.description, 500) || null,
      ranked: Boolean(input.ranked),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return TRY_AGAIN;
  refresh(id);
  return { ok: true };
}

export async function deleteList(id: number): Promise<ListResult> {
  if (!Number.isSafeInteger(id)) return TRY_AGAIN;
  const supabase = await createClient();
  const { error } = await supabase.from("lists").delete().eq("id", id);
  if (error) return TRY_AGAIN;
  revalidatePath("/lists");
  return { ok: true };
}

export async function addToList(id: number, releaseMbid: string): Promise<ListResult> {
  if (!Number.isSafeInteger(id) || !MBID.test(releaseMbid)) return TRY_AGAIN;
  const current = await items(id);
  if (current.some((item) => item.release_mbid === releaseMbid)) return { ok: true };
  if (current.length >= LIST_LIMIT) {
    return { ok: false, error: `A list holds up to ${LIST_LIMIT} albums.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("list_items")
    .insert({ list_id: id, release_mbid: releaseMbid, position: current.length + 1 });
  if (error) return TRY_AGAIN;
  await touch(id);
  refresh(id);
  return { ok: true };
}

export async function removeFromList(id: number, releaseMbid: string): Promise<ListResult> {
  if (!Number.isSafeInteger(id) || !MBID.test(releaseMbid)) return TRY_AGAIN;
  const supabase = await createClient();
  const { error } = await supabase
    .from("list_items")
    .delete()
    .eq("list_id", id)
    .eq("release_mbid", releaseMbid);
  if (error) return TRY_AGAIN;
  await renumber(id, (await items(id)).map((item) => item.release_mbid));
  await touch(id);
  refresh(id);
  return { ok: true };
}

/** Moves an album to a new spot (1 is the top), shuffling the rest along. */
export async function moveInList(id: number, releaseMbid: string, to: number): Promise<ListResult> {
  if (!Number.isSafeInteger(id) || !MBID.test(releaseMbid) || !Number.isInteger(to)) return TRY_AGAIN;
  const order = (await items(id)).map((item) => item.release_mbid);
  const from = order.indexOf(releaseMbid);
  if (from < 0) return TRY_AGAIN;
  const target = Math.max(0, Math.min(order.length - 1, to - 1));
  if (target === from) return { ok: true };

  order.splice(from, 1);
  order.splice(target, 0, releaseMbid);
  await renumber(id, order);
  await touch(id);
  refresh(id);
  return { ok: true };
}

export async function setListNote(id: number, releaseMbid: string, note: string): Promise<ListResult> {
  if (!Number.isSafeInteger(id) || !MBID.test(releaseMbid)) return TRY_AGAIN;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("list_items")
    .update({ note: clean(note, 280) || null })
    .eq("list_id", id)
    .eq("release_mbid", releaseMbid)
    .select("list_id");
  if (error || !data?.length) return TRY_AGAIN;
  await touch(id);
  refresh(id);
  return { ok: true };
}
