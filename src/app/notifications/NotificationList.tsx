import Link from "next/link";
import type { Notification, Person } from "@/lib/notifications";
import { leader, peopleList, shares, SIDES, type VersusResult } from "@/lib/versus-shared";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";
import VersusFaces from "@/components/VersusFaces";
import { buttonClass } from "@/components/ui";

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const strong = "font-medium text-text transition-colors hover:text-accent";

function Name({ person }: { person: Person }) {
  return (
    <Link href={`/u/${person.username}`} className={strong}>
      {person.display_name || person.username}
    </Link>
  );
}

function VersusResultText({ result }: { result: VersusResult }) {
  const { matchup, mine, tally } = result;
  const ahead = leader(tally);
  const split = shares(tally);

  // Who went which way, among the people they follow.
  const sides = SIDES.filter((side) => tally.friends[side].length > 0).map(
    (side) => `${peopleList(tally.friends[side])} picked ${matchup[side].name}.`,
  );

  return (
    <>
      <p>
        <Link href={`/versus/${matchup.day}`} className={strong}>
          {matchup.title}
        </Link>{" "}
        {ahead
          ? `is settled: ${matchup[ahead].name} took it over ${matchup[ahead === "left" ? "right" : "left"].name} with ${split[ahead]}%.`
          : `finished dead even between ${matchup.left.name} and ${matchup.right.name}.`}{" "}
        {mine === ahead ? "You called it." : `You picked ${matchup[mine].name}.`}
      </p>
      {sides.length > 0 && <p className="mt-0.5">{sides.join(" ")}</p>}
    </>
  );
}

function Icon({ item }: { item: Notification }) {
  if (item.kind === "versus-live") return <VersusFaces matchup={item.matchup} />;
  if (item.kind === "versus-result") {
    return <VersusFaces matchup={item.result.matchup} winner={leader(item.result.tally)} />;
  }

  return (
    <Link href={`/u/${item.person.username}`} className="shrink-0">
      <Avatar
        url={item.person.avatar_url}
        name={item.person.display_name || item.person.username}
        size="md"
      />
    </Link>
  );
}

function Text({ item }: { item: Notification }) {
  switch (item.kind) {
    case "follow":
      return (
        <p>
          <Name person={item.person} /> followed you
        </p>
      );
    case "reaction":
      return (
        <p>
          <Name person={item.person} /> {item.value === 1 ? "loved" : "said nah to"}{" "}
          {item.on === "rating"
            ? "your rating of "
            : item.on === "pick"
              ? `your pick of ${item.picked} in `
              : "your take on "}
          <Link href={item.subject.href} className={strong}>
            {item.subject.title}
          </Link>
        </p>
      );
    case "versus-live":
      return (
        <p>
          <Link href="/versus" className={strong}>
            Today&rsquo;s Versus: {item.matchup.title}.
          </Link>{" "}
          {item.matchup.left.name} vs {item.matchup.right.name}. Who you got?
        </p>
      );
    case "versus-result":
      return <VersusResultText result={item.result} />;
  }
}

/** Everything that's happened, newest first, with what's new since last time marked. */
export default function NotificationList({
  notifications,
  followingIds,
  seen,
}: {
  notifications: Notification[];
  followingIds: string[];
  /** When they last looked, as an ISO time. */
  seen: string | undefined;
}) {
  const isNew = (at: string) => !seen || Date.parse(at) > Date.parse(seen);
  const following = new Set(followingIds);

  return (
    <ul className="flex flex-col gap-2">
      {notifications.map((item) => (
        <li
          key={item.key}
          className={`flex items-center gap-3.5 rounded-xl border p-3.5 ${
            isNew(item.at) ? "border-accent/30 bg-accent/5" : "border-border bg-surface"
          }`}
        >
          <Icon item={item} />

          <div className="min-w-0 flex-1 text-sm leading-snug text-text-secondary">
            <Text item={item} />
            <p className="mt-0.5 text-xs text-text-muted">
              {timeAgo(item.at)}
              {isNew(item.at) && <span className="ml-2 font-medium text-accent">New</span>}
            </p>
          </div>

          {item.kind === "follow" && !following.has(item.person.id) && (
            <FollowButton
              targetId={item.person.id}
              username={item.person.username}
              signedIn
              isSelf={false}
              isFollowing={false}
              size="small"
            />
          )}
          {item.kind === "versus-live" && (
            <Link href="/versus" className={buttonClass({ size: "sm" })}>
              Pick
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
