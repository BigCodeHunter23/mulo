import Link from "next/link";
import { splitMentions } from "@/lib/replies-shared";

/**
 * A reply's words, each real person's @name a link to their profile. Kept
 * in a `<bdi>`, so whatever direction the words run in can't spill into the
 * page around them.
 */
export default function MentionText({
  text,
  people,
}: {
  text: string;
  /** The real usernames the reply names (`Reply.mentions`). */
  people: readonly string[];
}) {
  return (
    <bdi>
      {splitMentions(text, people).map((part, i) =>
        part.mention ? (
          <Link
            key={i}
            href={`/u/${part.mention}`}
            className="font-medium text-accent hover:underline"
          >
            {part.text}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </bdi>
  );
}
