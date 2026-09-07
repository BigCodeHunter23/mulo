"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toggleFollow, type FollowState } from "@/app/u/[username]/actions";
import { buttonClass } from "@/components/ui";

function Button({
  isFollowing,
  size,
}: {
  isFollowing: boolean;
  size: "normal" | "small";
}) {
  const { pending } = useFormStatus();
  const dimensions = size === "small" ? "h-8 px-3" : "h-10 px-4";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${dimensions} ${
        isFollowing
          ? "border-border-strong bg-transparent text-text-secondary hover:border-score-you/50 hover:text-score-you"
          : "border-accent bg-accent text-[#0b0b0e] hover:bg-accent-hover"
      }`}
    >
      {pending ? "…" : isFollowing ? "Following" : "Follow"}
    </button>
  );
}

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
  const [state, formAction] = useActionState<FollowState, FormData>(
    toggleFollow,
    {},
  );

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

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="target_id" value={targetId} />
      <input type="hidden" name="username" value={username} />
      <input
        type="hidden"
        name="intent"
        value={isFollowing ? "unfollow" : "follow"}
      />
      <Button isFollowing={isFollowing} size={size} />
      {state.error && (
        <p className="text-xs text-score-you">{state.error}</p>
      )}
    </form>
  );
}
