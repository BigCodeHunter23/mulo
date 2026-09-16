import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { findInvite } from "@/lib/invites";
import { getPublicTopPicks } from "@/lib/top-picks";
import Avatar from "@/components/Avatar";
import { buttonClass } from "@/components/ui";
import { acceptInvite } from "@/app/invite/actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const inviter = await findInvite(code);
  if (!inviter) return { title: "Join MULO" };

  const name = inviter.display_name || inviter.username;
  const title = `${name} invited you to MULO`;
  const description = `Rate music, crown your GOAT, and see where you and ${name} disagree.`;

  return {
    title,
    description,
    robots: { index: false },
    openGraph: {
      type: "website",
      siteName: "MULO",
      title,
      description,
      // Their profile card, GOAT list and all.
      images: [`/u/${inviter.username}/opengraph-image`],
    },
  };
}

/**
 * Where an invite link lands. Joining from here means the new account and the
 * inviter follow each other from the start.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const inviter = await findInvite(code);
  if (!inviter) notFound();

  // Already on MULO: go and see who sent the link.
  if (await getCurrentUser()) redirect(`/u/${inviter.username}`);

  const name = inviter.display_name || inviter.username;
  const picks = (await getPublicTopPicks(inviter.id, "artist")).slice(0, 3);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <Avatar url={inviter.avatar_url} name={name} size="xl" />
      <h1 className="display mt-6 text-3xl text-text">{name} wants you on MULO</h1>
      <p className="mt-3 text-sm leading-relaxed text-text-secondary">
        Rate albums, artists and songs out of ten, crown your GOAT, and see
        exactly where you and {name} disagree.
      </p>

      {picks.length > 0 && (
        <div className="mt-7 w-full rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
            {name}&rsquo;s GOAT
          </p>
          <ol className="mt-3 flex justify-center gap-5">
            {picks.map((pick, i) => (
              <li key={pick.mbid} className="flex w-20 flex-col items-center gap-1.5">
                <span
                  className={`artwork block h-16 w-16 overflow-hidden rounded-full ${
                    i === 0 ? "ring-2 ring-score-overall" : ""
                  }`}
                >
                  {pick.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pick.image} alt="" className="h-full w-full object-cover object-top" />
                  )}
                </span>
                <span className="line-clamp-2 text-xs text-text-secondary">
                  {i + 1}. {pick.title}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <form action={acceptInvite.bind(null, code)} className="mt-8 w-full">
        <button type="submit" className={`${buttonClass()} w-full`}>
          Join MULO
        </button>
      </form>
      <p className="mt-3 text-xs text-text-muted">
        You&rsquo;ll follow each other as soon as you&rsquo;re in.
      </p>
    </main>
  );
}
