import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Thread, { ThreadGone } from "@/components/Thread";
import type { ThreadPage } from "@/lib/app-api";
import { getThread } from "@/lib/replies";
import { getCurrentUser } from "@/lib/supabase/server";
import { mbidSchema, rowIdText } from "@/lib/validation";

type Props = { params: Promise<{ mbid: string; id: string }> };

/** The thread, or null when the address's parts don't agree: a review that isn't of this artist. */
async function threadAt(params: Props["params"]): Promise<ThreadPage | null> {
  const { mbid, id } = await params;
  const reviewId = rowIdText.safeParse(id);
  if (!mbidSchema.safeParse(mbid).success || !reviewId.success) return null;
  const thread = await getThread("artist", reviewId.data);
  if (
    thread.state === "open" &&
    (thread.head.kind !== "artist" || thread.head.artist.mbid.toLowerCase() !== mbid.toLowerCase())
  ) {
    return null;
  }
  return thread;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const thread = await threadAt(params);
  if (thread?.state !== "open" || thread.head.kind !== "artist") return { title: "Replies" };
  const { author, artist } = thread.head;
  return { title: `${author.display_name || author.username} on ${artist.name}` };
}

/** Replies on a review of an artist: `/artist/<mbid>/reviews/<artist rating id>`. */
export default async function ArtistReviewThread({ params }: Props) {
  const [thread, user] = await Promise.all([threadAt(params), getCurrentUser()]);
  if (!thread) notFound();
  if (thread.state !== "open") return <ThreadGone back={`/artist/${(await params).mbid}`} />;
  return <Thread page={thread} signedIn={Boolean(user)} />;
}
