"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setFollowing } from "@/app/u/[username]/actions";
import { buttonClass } from "@/components/ui";

/**
 * Switches the moment it's tapped, then confirms in the background. If the
 * save fails it switches back and says why.
 */
export default function FollowButton({
  targetId,
  username,
  signedIn,
  isSelf,
  isFollowing,
  size = "normal",
}: {
  targetId: string;
  username: string;
  signedIn: boolean;
  isSelf: boolean;
  isFollowing: boolean;
  size?: "normal" | "small";
}) {
  const [following, setFollowingState] = useState(isFollowing);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (isSelf) return null;

  if (!signedIn) {
    return (
      <Link
        href="/login"
        className={buttonClass({ size: size === "small" ? "sm" : "md" })}
      >
        Follow
      </Link>
    );
  }

  function toggle() {
    const next = !following;
    setFollowingState(next);
    setError(null);
    startTransition(async () => {
      const result = await setFollowing(targetId, username, next);
      if (!result.ok) {
        setFollowingState(!next);
        setError(result.error);
      }
    });
  }

  const dimensions = size === "small" ? "h-8 px-3" : "h-10 px-4";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={following}
        className={`inline-flex items-center justify-center rounded-lg border text-sm font-medium transition-all active:scale-95 ${dimensions} ${
          following
            ? "border-border-strong bg-transparent text-text-secondary hover:border-score-you/50 hover:text-score-you"
            : "border-accent bg-accent text-[#0b0b0e] hover:bg-accent-hover"
        }`}
      >
        {following ? "Following" : "Follow"}
      </button>
      {error && <p className="text-xs text-score-you">{error}</p>}
    </div>
  );
}
