import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFollowingFeed, getGlobalFeed } from "@/lib/feed";
import FeedItem from "@/components/FeedItem";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const recent = await getGlobalFeed(10);

    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <section className="mb-10 text-center">
          <h1 className="text-4xl font-bold">MULO</h1>
          <p className="mt-2 text-lg text-gray-600">
            Rate and review the music you listen to, and see what the people
            you follow are playing.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/login"
              className="rounded bg-black px-5 py-2.5 text-white"
            >
              Get started
            </Link>
            <Link
              href="/search"
              className="rounded border border-gray-300 px-5 py-2.5"
            >
              Browse music
            </Link>
          </div>
        </section>

        {recent.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-bold">Recent on MULO</h2>
            <ul className="flex flex-col gap-4">
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
      <h1 className="mb-6 text-2xl font-bold">Your feed</h1>

      {feed.length === 0 ? (
        <EmptyFeed />
      ) : (
        <ul className="flex flex-col gap-4">
          {feed.map((item) => (
            <FeedItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}

async function EmptyFeed() {
  const recent = await getGlobalFeed(10);

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded border border-gray-200 p-6 text-center">
        <p className="mb-1 font-medium">Your feed is empty</p>
        <p className="mb-4 text-sm text-gray-600">
          Follow other people to see what they&rsquo;re rating.
        </p>
        <Link
          href="/people"
          className="inline-block rounded bg-black px-4 py-2 text-white"
        >
          Find people to follow
        </Link>
      </div>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Recent on MULO</h2>
          <ul className="flex flex-col gap-4">
            {recent.map((item) => (
              <FeedItem key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
