"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReply, postReply } from "@/app/replies/actions";
import type { Reply } from "@/lib/app-api";
import { haptic } from "@/lib/haptics";
import { prefillFor, type ThreadKind } from "@/lib/replies-shared";
import ReplyBox from "@/components/ReplyBox";
import ReplyRow from "@/components/ReplyRow";

/**
 * A thread's replies and the box to add one. Reply on a reply starts the box
 * with their @name. A new reply shows once it's saved; the page is then read
 * again so every count catches up.
 */
export default function ThreadReplies({
  kind,
  targetId,
  initial,
  canReply,
}: {
  kind: ThreadKind;
  targetId: number;
  initial: Reply[];
  canReply: boolean;
}) {
  const router = useRouter();
  const [replies, setReplies] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  function replyTo(username: string) {
    setDraft((current) => prefillFor(current, username));
    box.current?.focus();
  }

  function post() {
    setError(null);
    const body = draft;
    startTransition(async () => {
      const result = await postReply(kind, targetId, body);
      if (!result.ok) {
        haptic("error");
        setError(result.error);
        return;
      }
      haptic("tap");
      setReplies((current) => [...current, result.reply]);
      setDraft("");
      router.refresh();
    });
  }

  function remove(reply: Reply) {
    setError(null);
    startTransition(async () => {
      const result = await deleteReply(reply.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReplies((current) => current.filter((r) => r.id !== reply.id));
      router.refresh();
    });
  }

  return (
    <>
      {replies.length === 0 ? (
        <p className="text-sm text-text-muted">No replies yet. Start it off.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {replies.map((reply) => (
            <ReplyRow
              key={reply.id}
              reply={reply}
              canReply={canReply}
              onReply={replyTo}
              onDelete={remove}
            />
          ))}
        </ul>
      )}
      {canReply && (
        <div className="mt-6">
          <ReplyBox
            ref={box}
            value={draft}
            onChange={setDraft}
            onPost={post}
            pending={pending}
            error={error}
          />
        </div>
      )}
    </>
  );
}
