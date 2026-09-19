"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setFollowing } from "@/app/u/[username]/actions";
import { buttonClass } from "@/components/ui";
import { haptic } from "@/lib/haptics";

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
  block = false,
}: {
  targetId: string;
  username: string;
  signedIn: boolean;
  isSelf: boolean;
  isFollowing: boolean;
  size?: "normal" | "small";
  /** Fill the width it's given, for a row of actions on a phone. */
  block?: boolean;
}) {
  const [following, setFollowingState] = useState(isFollowing);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (isSelf) return null;

  if (!signedIn) {
    return (
      <Link
        href="/login"
        className={`${buttonClass({ size: size === "small" ? "sm" : "md" })} ${block ? "w-full" : ""}`}
      >
        Follow
      </Link>
    );
  }

  function toggle() {
    haptic("tap");
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

  const dimensions =
    size === "small" ? "h-9 px-3.5 sm:h-8 sm:px-3" : "h-11 px-5 sm:h-10 sm:px-4";

  return (
    <div className={`flex flex-col gap-1 ${block ? "w-full items-stretch" : "items-end"}`}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={following}
        className={`inline-flex items-center justify-center rounded-lg border text-sm font-semibold transition-all active:scale-95 ${dimensions} ${
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
