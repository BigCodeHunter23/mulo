import { getCurrentUser } from "@/lib/supabase/server";
import { getFollowingFeed, getGlobalFeed } from "@/lib/feed";
import FeedItem from "@/components/FeedItem";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    const recent = await getGlobalFeed(8);

    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-16 sm:px-6">
        <section className="mb-16 text-center">
          <h1 className="display text-5xl text-text sm:text-6xl">
            Every record,
            <br />
            <span className="text-accent">rated by people you trust.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-text-secondary">
            Rate and review the music you listen to, follow your friends, and
            see what they&rsquo;re playing.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <ButtonLink href="/login">Get started</ButtonLink>
            <ButtonLink href="/search" variant="secondary">
              Browse music
            </ButtonLink>
          </div>
        </section>

        {recent.length > 0 && (
          <section>
            <SectionHeading>Recently rated</SectionHeading>
            <ul className="flex flex-col gap-3">
              {recent.map((item) => (
                <FeedItem key={item.id} item={item} />
              ))}
            </ul>
          </section>
        )}
      </main>
    );
  }

  const feed = await getFollowingFeed(user.id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      {feed.length === 0 ? (
        <EmptyFeed />
      ) : (
        <>
          <SectionHeading>Your feed</SectionHeading>
          <ul className="flex flex-col gap-3">
            {feed.map((item) => (
              <FeedItem key={item.id} item={item} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

async function EmptyFeed() {
  const recent = await getGlobalFeed(8);

  return (
    <div className="flex flex-col gap-12">
      <div>
        <SectionHeading>Your feed</SectionHeading>
        <EmptyState
          title="Nothing here yet"
          body="Follow other people and their ratings will show up here."
          action={<ButtonLink href="/people">Find people to follow</ButtonLink>}
        />
      </div>

      {recent.length > 0 && (
        <section>
          <SectionHeading>Recently rated</SectionHeading>
          <ul className="flex flex-col gap-3">
            {recent.map((item) => (
              <FeedItem key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
