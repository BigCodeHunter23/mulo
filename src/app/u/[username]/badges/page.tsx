import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBadgeBoard } from "@/lib/badges";
import { getProfileByUsername } from "@/lib/social";
import { getCurrentUser } from "@/lib/supabase/server";
import BadgeBoardView from "@/components/BadgeBoard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) return { title: "Badges" };

  const name = profile.display_name || profile.username;
  const title = `${name}'s badges`;
  const description = `The badges ${name} has collected on MULO, and the ones still out there.`;

  return {
    title,
    description,
    openGraph: { type: "website", siteName: "MULO", title, description },
  };
}

export default async function BadgesPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const user = await getCurrentUser();
  const isSelf = user?.id === profile.id;
  const name = profile.display_name || profile.username;
  const board = await getBadgeBoard(profile.id);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <Link
        href={`/u/${profile.username}`}
        className="mb-6 -ml-1 inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text"
      >
        <span aria-hidden="true">‹</span>
        {isSelf ? "Your profile" : name}
      </Link>

      <BadgeBoardView
        board={board}
        heading={isSelf ? "Your badges" : `${name}'s badges`}
        intro={
          isSelf
            ? "Earned ones say how you got them. The rest only show their name, so there is something left to find."
            : `What ${name} has collected so far, and what is still out there.`
        }
      />
    </main>
  );
}
