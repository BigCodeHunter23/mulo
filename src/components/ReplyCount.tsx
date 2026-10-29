import Link from "next/link";
import { replyCountText } from "@/lib/replies-shared";

function Bubble() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-5A8 8 0 1 1 21 12z" />
    </svg>
  );
}

/**
 * How many replies a review or take has, beside love and nah, opening its
 * thread: "4 replies", or "Reply" at none. Signed out the count can't be
 * read, so it says "Replies".
 */
export default function ReplyCount({
  href,
  count,
  signedIn,
}: {
  href: string;
  count: number;
  signedIn: boolean;
}) {
  const text = signedIn ? replyCountText(count) : "Replies";
  return (
    <Link
      href={href}
      aria-label={`${text}, open thread`}
      className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs tabular-nums text-text-muted transition-colors hover:border-border-strong hover:text-text"
    >
      <Bubble />
      {text}
    </Link>
  );
}
