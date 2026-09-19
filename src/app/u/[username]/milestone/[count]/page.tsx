import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMilestoneCard } from "@/lib/milestone-card";
import { milestonePath } from "@/lib/milestones";
import { coverSrc } from "@/lib/cover-url";
import { getCurrentUser } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";
import ShareButton from "@/components/ShareButton";
import StoryButton from "@/components/StoryButton";
import { ButtonLink } from "@/components/ui";

type Params = Promise<{ username: string; count: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username, count } = await params;
  const card = await getMilestoneCard(username, Number(count));
  if (!card) return { title: "Milestone" };

  const title = `${card.profile.name} has rated ${card.count} albums`;
  const description = `${card.profile.name}'s ${card.count} albums on MULO, and the ones they rate highest.`;
  return { title, description, openGraph: { type: "website", siteName: "MULO", title, description } };
}

/**
 * A milestone worth showing off: the number, and the records that scored
 * highest on the way there. This is the page a shared milestone link opens.
 */
export default async function MilestonePage({ params }: { params: Params }) {
  const { username, count } = await params;
  const [card, user] = await Promise.all([
    getMilestoneCard(username, Number(count)),
    getCurrentUser(),
  ]);
  if (!card) notFound();

  const own = user?.id === card.profile.id;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <div className="flex flex-col items-center text-center">
        <Link href={`/u/${card.profile.username}`}>
          <Avatar url={card.profile.avatarUrl} name={card.profile.name} size="xl" eager />
        </Link>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
          Milestone
        </p>
        <h1 className="display mt-2 text-7xl leading-none text-score-overall sm:text-8xl">
          {card.count}
        </h1>
        <p className="mt-3 text-lg text-text">
          albums rated by{" "}
          <Link href={`/u/${card.profile.username}`} className="font-medium hover:text-accent">
            {card.profile.name}
          </Link>
        </p>
        {card.average !== null && (
          <p className="mt-1 text-sm text-text-secondary">
            {card.average.toFixed(1)} average score
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ShareButton
            url={milestonePath(card.profile.username, card.count)}
            title={`${card.profile.name} has rated ${card.count} albums on MULO`}
            text={own ? `${card.count} albums rated on MULO.` : undefined}
          />
          <StoryButton
            src={`${milestonePath(card.profile.username, card.count)}/story`}
            filename={`mulo-${card.count}-albums`}
          />
          {!user && <ButtonLink href="/login?mode=signup" variant="secondary">Join MULO</ButtonLink>}
        </div>
      </div>

      {card.top.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-center text-sm font-medium text-text-secondary">
            Rated highest
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {card.top.map((album) => (
              <li key={album.mbid}>
                <Link href={`/album/${album.mbid}`} className="group block">
                  <span className="artwork relative block aspect-square overflow-hidden rounded-lg">
                    {album.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverSrc(album.cover, 250) ?? album.cover}
                        alt=""
                        className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                      />
                    )}
                    <span className="absolute bottom-2 right-2 rounded-md bg-bg/85 px-2 py-0.5 text-sm font-bold tabular-nums text-score-overall">
                      {album.score}
                    </span>
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium text-text group-hover:text-accent">
                    {album.title}
                  </span>
                  {album.artist && (
                    <span className="block truncate text-xs text-text-muted">{album.artist}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
