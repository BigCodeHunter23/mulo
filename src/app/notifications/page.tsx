import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { getNotifications, SEEN_COOKIE } from "@/lib/notifications";
import { getFollowingIds } from "@/lib/social";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";
import MarkSeen from "./MarkSeen";
import NotificationList from "./NotificationList";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [notifications, followingIds, store] = await Promise.all([
    getNotifications(user.id),
    getFollowingIds(user.id),
    cookies(),
  ]);

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
        <NotificationList
          notifications={notifications}
          followingIds={followingIds}
          // Read before it's updated, so what's new since last time stays marked.
          seen={store.get(SEEN_COOKIE)?.value}
        />
      )}
    </main>
  );
}
