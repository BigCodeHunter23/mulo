import type { FriendScore } from "@/lib/friend-scores";
import Avatar from "@/components/Avatar";

/** Faces fit on a card; a fourth one and it's a crowd. */
const SHOWN = 3;

/**
 * The people you follow who have rated this, as faces under a card.
 *
 * No scores here on purpose: a grid is for deciding what to open, and a face
 * you know is a better reason to open something than a number. What they
 * actually gave it is on the page itself.
 */
export default function FriendFaces({
  friends,
  className = "",
}: {
  friends: FriendScore[];
  className?: string;
}) {
  if (friends.length === 0) return null;

  return (
    <span
      title={friends.map((friend) => `${friend.name} ${friend.score}`).join(", ")}
      className={`flex items-center gap-1 ${className}`}
    >
      <span className="flex -space-x-1.5">
        {friends.slice(0, SHOWN).map((friend) => (
          <span key={friend.username} className="block rounded-full ring-2 ring-bg">
            <Avatar url={friend.avatar_url} name={friend.name} size="xs" />
          </span>
        ))}
      </span>
      {friends.length > SHOWN && (
        <span className="text-[10px] tabular-nums text-text-muted">
          +{friends.length - SHOWN}
        </span>
      )}
    </span>
  );
}
