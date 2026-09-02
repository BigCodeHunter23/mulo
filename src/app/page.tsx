import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFollowingFeed, getGlobalFeed } from "@/lib/feed";
import FeedItem from "@/components/FeedItem";
import SectionHeading from "@/components/SectionHeading";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const recent = await getGlobalFeed(10);

    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <section className="mb-12 text-center">
          <h1 className="font-display text-5xl font-bold tracking-tight text-mulo-navy">
            MULO
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-mulo-orange">
            For Music Lovers
          </p>
          <p className="mx-auto mt-4 max-w-md text-mulo-muted">
            Rate and review the music you listen to, and see what the people
            you follow are playing.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/login"
              className="rounded bg-mulo-orange px-5 py-2.5 font-medium text-white hover:bg-mulo-orange-dark"
            >
              Get started
            </Link>
            <Link
              href="/search"
              className="rounded border border-gray-300 px-5 py-2.5 font-medium hover:border-gray-400"
            >
              Browse music
            </Link>
          </div>
        </section>

        {recent.length > 0 && (
          <section>
            <SectionHeading>Recent on MULO</SectionHeading>
            <ul className="flex flex-col">
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
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      {feed.length === 0 ? (
        <EmptyFeed />
      ) : (
        <>
          <SectionHeading>Your Feed</SectionHeading>
          <ul className="flex flex-col">
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
  const recent = await getGlobalFeed(10);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <SectionHeading>Your Feed</SectionHeading>
        <div className="rounded border border-gray-200 p-8 text-center">
          <p className="mb-1 font-display text-lg font-semibold text-mulo-navy">
            Your feed is empty
          </p>
          <p className="mb-4 text-sm text-mulo-muted">
            Follow other people to see what they&rsquo;re rating.
          </p>
          <Link
            href="/people"
            className="inline-block rounded bg-mulo-orange px-4 py-2 font-medium text-white hover:bg-mulo-orange-dark"
          >
            Find people to follow
          </Link>
        </div>
      </div>

      {recent.length > 0 && (
        <section>
          <SectionHeading>Recent on MULO</SectionHeading>
          <ul className="flex flex-col">
            {recent.map((item) => (
              <FeedItem key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
