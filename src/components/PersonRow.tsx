import Link from "next/link";
import type { PublicProfile } from "@/lib/social";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";

/**
 * One person in a list, with a way to follow them from where you stand.
 *
 * The same row serves the People page, the follower and following lists and
 * the follow step during signup, so following somebody feels identical
 * wherever you come across them.
 */
export default function PersonRow({
  profile,
  signedIn,
  isSelf,
  isFollowing,
  showBio = true,
}: {
  profile: PublicProfile;
  signedIn: boolean;
  isSelf: boolean;
  isFollowing: boolean;
  showBio?: boolean;
}) {
  const name = profile.display_name || profile.username;

  return (
    <li className="flex items-center gap-3.5 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong">
      <Link href={`/u/${profile.username}`}>
        <Avatar url={profile.avatar_url} name={name} size="md" />
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/u/${profile.username}`}
          className="block truncate font-medium text-text transition-colors hover:text-accent"
        >
          {name}
        </Link>
        <p className="truncate text-sm text-text-muted">@{profile.username}</p>
        {showBio && profile.bio && (
          <p className="mt-1 line-clamp-1 text-sm text-text-secondary">
            {profile.bio}
          </p>
        )}
      </div>

      <FollowButton
        targetId={profile.id}
        username={profile.username}
        signedIn={signedIn}
        isSelf={isSelf}
        isFollowing={isFollowing}
        size="small"
      />
    </li>
  );
}
