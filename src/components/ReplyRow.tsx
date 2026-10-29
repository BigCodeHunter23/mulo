"use client";

import Link from "next/link";
import type { Reply } from "@/lib/app-api";
import Avatar from "@/components/Avatar";
import MentionText from "@/components/MentionText";
import ReportButton from "@/components/ReportButton";

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const quiet =
  "text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline";

/**
 * One reply: who, when, their words with @names linked, then Reply, Delete
 * (your own, or any on your own review) and Report (anybody else's).
 */
export default function ReplyRow({
  reply,
  canReply,
  onReply,
  onDelete,
}: {
  reply: Reply;
  canReply: boolean;
  onReply: (username: string) => void;
  onDelete: (reply: Reply) => void;
}) {
  const name = reply.author.display_name || reply.author.username;
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Link href={`/u/${reply.author.username}`} className="shrink-0">
          <Avatar url={reply.author.avatar_url} name={name} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link
              href={`/u/${reply.author.username}`}
              className="font-medium text-text transition-colors hover:text-accent"
            >
              {name}
            </Link>
            <span className="text-xs text-text-muted" suppressHydrationWarning>
              {timeAgo(reply.createdAt)}
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-text-secondary">
            <MentionText text={reply.body} people={reply.mentions} />
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            {canReply && (
              <button
                type="button"
                onClick={() => onReply(reply.author.username)}
                className={quiet}
              >
                Reply
              </button>
            )}
            {reply.canDelete && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Delete this reply? It can't be brought back."))
                    onDelete(reply);
                }}
                className={quiet}
              >
                Delete
              </button>
            )}
            {!reply.mine && (
              <ReportButton
                replyId={reply.id}
                author={{ id: reply.author.id, username: reply.author.username, name }}
                signedIn
              />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
