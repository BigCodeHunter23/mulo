"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setBlocked } from "@/app/u/[username]/actions";
import type { BlockedPerson } from "@/lib/blocks";
import Avatar from "@/components/Avatar";
import { buttonClass } from "@/components/ui";

/**
 * Who you've blocked, and the way back. A block made in a bad week should be
 * as easy to undo as it was to make.
 */
export default function BlockedList({ people }: { people: BlockedPerson[] }) {
  const [blocked, setBlockedPeople] = useState(people);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (blocked.length === 0) {
    return <p className="text-sm text-text-muted">You haven&rsquo;t blocked anybody.</p>;
  }

  function unblock(person: BlockedPerson) {
    setError(null);
    startTransition(async () => {
      const result = await setBlocked(person.id, person.username, false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBlockedPeople((current) => current.filter((other) => other.id !== person.id));
    });
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-2 text-sm text-error-soft">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {blocked.map((person) => (
          <li key={person.id} className="flex items-center gap-3">
            <Avatar
              url={person.avatar_url}
              name={person.display_name || person.username}
              size="sm"
            />
            <Link
              href={`/u/${person.username}`}
              className="min-w-0 flex-1 truncate text-sm text-text-secondary transition-colors hover:text-text"
            >
              {person.display_name || person.username}
            </Link>
            <button
              type="button"
              onClick={() => unblock(person)}
              disabled={pending}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Unblock
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
