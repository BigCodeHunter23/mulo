import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getCachedArtist } from "@/lib/catalog";
import { getGauntletRun } from "@/lib/gauntlet";
import StackDeck from "@/app/stack/StackDeck";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mbid: string }>;
}): Promise<Metadata> {
  const { mbid } = await params;
  const artist = await getCachedArtist(mbid);
  return { title: artist ? `The Gauntlet: ${artist.name}` : "The Gauntlet" };
}

/**
 * Every album an artist made, one card at a time, and a ranking at the end.
 * The same card as The Stack, so the thumb already knows what to do.
 */
export default async function GauntletPage({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const artist = await getCachedArtist(mbid);
  if (!artist) notFound();

  const supabase = await createClient();
  const [{ run, total }, { data: me }] = await Promise.all([
    getGauntletRun(user.id, mbid, artist.name),
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
  ]);

  const rankingHref = me?.username ? `/u/${me.username}/ranks/${mbid}` : `/artist/${mbid}`;

  // Nothing left to rate: straight to the result.
  if (run.length === 0 && total > 0) redirect(rankingHref);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          The Gauntlet
        </p>
        <h1 className="display mt-2 text-3xl text-text sm:text-4xl">{artist.name}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
          Every album, oldest first. Score the lot and get your ranking of their
          whole discography at the end.
        </p>
      </header>

      {total === 0 ? (
        <p className="text-center text-sm text-text-muted">
          MULO hasn&rsquo;t got {artist.name}&rsquo;s albums yet.{" "}
          <Link href={`/artist/${mbid}`} className="text-accent underline-offset-4 hover:underline">
            Open their page
          </Link>{" "}
          to fetch them, then come back.
        </p>
      ) : (
        <StackDeck
          albums={run}
          finish={{ href: rankingHref, label: `See your ${artist.name} ranking` }}
        />
      )}
    </main>
  );
}
