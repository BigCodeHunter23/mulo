"use client";

import { useState, useTransition } from "react";
import { artistSuggestions, setArtistFollowing } from "@/app/artist/[mbid]/actions";
import ArtistSuggestions from "@/components/ArtistSuggestions";
import LoginLink from "@/components/LoginLink";
import { buttonClass } from "@/components/ui";
import type { ArtistSummary } from "@/lib/app-api";
import { followersLine } from "@/lib/artist-follows-shared";
import { haptic } from "@/lib/haptics";

/**
 * Follow under an artist's name, with "1,204 followers" beside it from three.
 * Switches the moment it's tapped and puts itself back if the save fails, as
 * following a person does. A first artist follow offers the suggestions card
 * right there, once.
 */
export default function ArtistFollowButton({
  mbid,
  signedIn,
  following: followingAtFirst,
  followers,
}: {
  mbid: string;
  signedIn: boolean;
  following: boolean;
  followers: number;
}) {
  const [following, setFollowing] = useState(followingAtFirst);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<ArtistSummary[]>([]);
  const [, startTransition] = useTransition();

  // The count moves with the button, so tapping it shows at once.
  const shift = following === followingAtFirst ? 0 : following ? 1 : -1;
  const line = followersLine(followers + shift);
  const count = line && <span className="text-sm text-text-secondary">{line}</span>;

  if (!signedIn) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
        <LoginLink className={buttonClass({ size: "sm" })}>Follow</LoginLink>
        {count}
      </div>
    );
  }

  function toggle() {
    haptic("tap");
    const next = !following;
    setFollowing(next);
    setError(null);
    startTransition(async () => {
      const result = await setArtistFollowing(mbid, next);
      if (!result.ok) {
        setFollowing(!next);
        setError(result.error);
        return;
      }
      if (result.first) setSuggested(await artistSuggestions());
    });
  }

  return (
    <div className="mt-4 flex w-full flex-col items-center gap-3 sm:items-start">
      <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={following}
          className={`inline-flex h-9 items-center justify-center rounded-lg border px-3.5 text-sm font-semibold transition-all active:scale-95 sm:h-8 sm:px-3 ${
            following
              ? "border-border-strong bg-transparent text-text-secondary hover:border-score-you/50 hover:text-score-you"
              : "border-accent bg-accent text-ink hover:bg-accent-hover"
          }`}
        >
          {following ? "Following" : "Follow"}
        </button>
        {count}
      </div>
      {error && (
        <p role="alert" className="text-xs text-score-you">
          {error}
        </p>
      )}
      {suggested.length > 0 && <ArtistSuggestions artists={suggested} always />}
    </div>
  );
}
