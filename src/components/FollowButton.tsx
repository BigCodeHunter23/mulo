"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toggleFollow, type FollowState } from "@/app/u/[username]/actions";

function Button({
  isFollowing,
  size,
}: {
  isFollowing: boolean;
  size: "normal" | "small";
}) {
  const { pending } = useFormStatus();

  const base =
    size === "small"
      ? "rounded px-3 py-1.5 text-sm"
      : "rounded px-4 py-2 text-sm";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${base} border font-display font-medium disabled:opacity-60 ${
        isFollowing
          ? "border-follow-green text-follow-green hover:bg-follow-green/5"
          : "border-mulo-orange bg-mulo-orange text-white hover:bg-mulo-orange-dark"
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
        className="rounded border border-mulo-orange bg-mulo-orange px-4 py-2 font-display text-sm font-medium text-white"
      >
        Follow
      </Link>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="target_id" value={targetId} />
      <input type="hidden" name="username" value={username} />
      <input
        type="hidden"
        name="intent"
        value={isFollowing ? "unfollow" : "follow"}
      />
      <Button isFollowing={isFollowing} size={size} />
      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
