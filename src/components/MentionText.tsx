import Link from "next/link";
import { splitMentions } from "@/lib/replies-shared";

/** A reply's words, each real person's @name a link to their profile. */
export default function MentionText({
  text,
  people,
}: {
  text: string;
  /** The real usernames the reply names (`Reply.mentions`). */
  people: readonly string[];
}) {
  return (
    <>
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
    </>
  );
}
