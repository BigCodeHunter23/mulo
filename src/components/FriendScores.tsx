"use client";

import Link from "next/link";
import { useState } from "react";
import type { FriendScore } from "@/lib/friend-scores";
import Avatar from "@/components/Avatar";

/** How many faces fit before the rest become a number. */
const FACES = 5;

/** "Sam", "Sam and Jess", "Sam, Jess and Marcus". */
function listNames(names: string[]) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Who among the people you follow has rated this, under the three scores.
 *
 * The blue Friends number says an opinion exists; this says whose it is,
 * which is the part worth opening. Tap it for what each of them gave.
 */
export default function FriendScores({
  friends,
  /** What they rated, for the sentence: "this record", "Kendrick Lamar". */
  what,
}: {
  friends: FriendScore[];
  what: string;
}) {
  const [open, setOpen] = useState(false);
  if (friends.length === 0) return null;

  const shown = friends.slice(0, FACES);
  const sentence =
    friends.length <= 3
      ? `${listNames(friends.map((friend) => friend.name))} ${
          friends.length === 1 ? "has" : "have"
        } rated ${what}`
      : `${friends.length} people you follow have rated ${what}`;

  return (
    <div className="mt-3 w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface/40 px-3 py-2 text-left transition-colors hover:border-border-strong"
      >
        <span className="flex shrink-0 -space-x-2">
          {shown.map((friend) => (
            <span key={friend.username} className="block rounded-full ring-2 ring-bg">
              <Avatar url={friend.avatar_url} name={friend.name} size="xs" />
            </span>
          ))}
        </span>
        {/* Two lines rather than a truncation: on a phone the names are the
            point, and "Sam, Jess and Marcus have rated this re…" isn't. */}
        <span className="min-w-0 flex-1 text-left text-xs leading-snug text-text-secondary">
          <span className="line-clamp-2">{sentence}</span>
        </span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-xs text-text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <ul className="scroll-quiet mt-1.5 flex max-h-56 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1">
          {friends.map((friend) => (
            <li key={friend.username}>
              <Link
                href={`/u/${friend.username}`}
                className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm text-text-secondary transition-colors hover:text-text"
              >
                <Avatar url={friend.avatar_url} name={friend.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">{friend.name}</span>
                <span className="w-7 shrink-0 rounded-md bg-score-friends/15 py-0.5 text-center text-xs font-bold tabular-nums text-score-friends">
                  {friend.score}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
