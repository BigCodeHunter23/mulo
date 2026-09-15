import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getFollowingFeed } from "@/lib/feed";
import FeedItem from "@/components/FeedItem";
import DiscoverSections from "@/components/DiscoverSections";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-14 sm:px-6">
        <section className="mx-auto mb-16 max-w-3xl text-center">
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
            <ButtonLink href="/discover" variant="secondary">
              Explore music
            </ButtonLink>
          </div>
        </section>

        <DiscoverSections />
      </main>
    );
  }

  const supabase = await createClient();
  const [{ data: profile }, feed] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", user.id).maybeSingle(),
    getFollowingFeed(user.id),
  ]);

  // A new account hasn't picked a username yet, so nothing else would work.
  if (!profile) redirect("/welcome");

  if (feed.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6">
        <div className="mb-14">
          <SectionHeading>Your feed</SectionHeading>
          <EmptyState
            title="Your feed fills up as you follow people"
            body="Their ratings and reviews show up here, newest first."
            action={<ButtonLink href="/people">Find people to follow</ButtonLink>}
          />
        </div>
        <DiscoverSections />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SectionHeading
        action={
          <Link
            href="/discover"
            className="text-xs text-text-muted transition-colors hover:text-text"
          >
            Discover more →
          </Link>
        }
      >
        Your feed
      </SectionHeading>
      <ul className="flex flex-col gap-3">
        {feed.map((item) => (
          <FeedItem key={item.id} item={item} />
        ))}
      </ul>
    </main>
  );
}
