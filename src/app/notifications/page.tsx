import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { getNotifications, SEEN_COOKIE, type Notification } from "@/lib/notifications";
import { getFollowingIds } from "@/lib/social";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";
import MarkSeen from "./MarkSeen";

export const metadata: Metadata = { title: "Notifications" };

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

function Name({ person }: { person: Notification["person"] }) {
  return (
    <Link
      href={`/u/${person.username}`}
      className="font-medium text-text transition-colors hover:text-accent"
    >
      {person.display_name || person.username}
    </Link>
  );
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [notifications, followingIds, store] = await Promise.all([
    getNotifications(user.id),
    getFollowingIds(user.id),
    cookies(),
  ]);

  // Read before it's updated, so what's new since last time stays marked.
  const seen = store.get(SEEN_COOKIE)?.value;
  const isNew = (at: string) => !seen || Date.parse(at) > Date.parse(seen);
  const following = new Set(followingIds);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <MarkSeen />
      <SectionHeading>Notifications</SectionHeading>

      {notifications.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          body="When people follow you, or love or disagree with your ratings, it shows up here."
          action={<ButtonLink href="/people">Find people to follow</ButtonLink>}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((item) => (
            <li
              key={item.key}
              className={`flex items-center gap-3.5 rounded-xl border p-3.5 ${
                isNew(item.at)
                  ? "border-accent/30 bg-accent/5"
                  : "border-border bg-surface"
              }`}
            >
              <Link href={`/u/${item.person.username}`} className="shrink-0">
                <Avatar
                  url={item.person.avatar_url}
                  name={item.person.display_name || item.person.username}
                  size="md"
                />
              </Link>

              <div className="min-w-0 flex-1 text-sm leading-snug text-text-secondary">
                {item.kind === "follow" ? (
                  <p>
                    <Name person={item.person} /> followed you
                  </p>
                ) : (
                  <p>
                    <Name person={item.person} />{" "}
                    {item.value === 1 ? "loved" : "said nah to"} your rating of{" "}
                    <Link
                      href={item.subject.href}
                      className="font-medium text-text transition-colors hover:text-accent"
                    >
                      {item.subject.title}
                    </Link>
                  </p>
                )}
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
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
