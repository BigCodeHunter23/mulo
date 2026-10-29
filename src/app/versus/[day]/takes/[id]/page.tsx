import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Thread, { ThreadGone, ThreadLocked } from "@/components/Thread";
import type { ThreadPage } from "@/lib/app-api";
import { getThread } from "@/lib/replies";
import { getCurrentUser } from "@/lib/supabase/server";
import { rowIdText } from "@/lib/validation";
import { DAY_PATTERN } from "@/lib/versus";

type Props = { params: Promise<{ day: string; id: string }> };

/** The thread, or null when the address's parts don't agree: a take from another day. */
async function threadAt(params: Props["params"]): Promise<ThreadPage | null> {
  const { day, id } = await params;
  const takeId = rowIdText.safeParse(id);
  if (!DAY_PATTERN.test(day) || !takeId.success) return null;
  const thread = await getThread("take", takeId.data);
  if (thread.state === "locked" && thread.day !== day) return null;
  if (thread.state === "open" && (thread.head.kind !== "take" || thread.head.matchup.day !== day)) {
    return null;
  }
  return thread;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const thread = await threadAt(params);
  if (thread?.state !== "open" || thread.head.kind !== "take") return { title: "Takes" };
  const { take, matchup } = thread.head;
  return { title: `${take.author.display_name || take.author.username} on ${matchup.title}` };
}

/** Replies on a take: `/versus/<day>/takes/<take id>`. */
export default async function TakeThread({ params }: Props) {
  const [thread, user] = await Promise.all([threadAt(params), getCurrentUser()]);
  if (!thread) notFound();
  const { day } = await params;
  if (thread.state === "locked") return <ThreadLocked day={day} />;
  if (thread.state === "gone") return <ThreadGone back={`/versus/${day}`} />;
  return <Thread page={thread} signedIn={Boolean(user)} />;
}
