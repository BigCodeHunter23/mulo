import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfileByUsername } from "@/lib/social";
import { getHeadToHead, MINIMUM, type BlindSpot, type Clash } from "@/lib/head-to-head";
import { getCurrentUser } from "@/lib/supabase/server";
import { coverSrc } from "@/lib/cover-url";
import Avatar from "@/components/Avatar";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `You vs @${username}`,
    description: `Where you and @${username} agree, and where you really don't.`,
  };
}

/** A small square, the cover or the artist's photo, with a graceful gap. */
function Thumb({ url, alt }: { url: string | null; alt: string }) {
  const src = coverSrc(url, 250);
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-surface-raised">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      )}
    </div>
  );
}

function ClashRow({ item, theirName }: { item: Clash; theirName: string }) {
  const gap = Math.abs(item.yours - item.theirs);
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover"
      >
        <Thumb url={item.coverUrl} alt={item.title} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          {item.subtitle && (
            <span className="block truncate text-xs text-text-muted">{item.subtitle}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2 tabular-nums">
          <span className="text-right">
            <span className="block text-base font-semibold text-score-you">{item.yours}</span>
            <span className="block text-[10px] uppercase tracking-wide text-text-muted">You</span>
          </span>
          <span className="text-xs text-text-muted">·</span>
          <span className="text-right">
            <span className="block text-base font-semibold text-score-friends">{item.theirs}</span>
            <span className="block max-w-[5rem] truncate text-[10px] uppercase tracking-wide text-text-muted">
              {theirName}
            </span>
          </span>
          <span className="ml-1 w-8 shrink-0 text-right text-xs text-text-muted">
            {gap > 0 ? `${gap} apart` : "same"}
          </span>
        </span>
      </Link>
    </li>
  );
}

function SpotRow({ item }: { item: BlindSpot }) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover"
      >
        <Thumb url={item.coverUrl} alt={item.title} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          {item.subtitle && (
            <span className="block truncate text-xs text-text-muted">{item.subtitle}</span>
          )}
        </span>
        <span className="shrink-0 text-base font-semibold tabular-nums text-score-overall">
          {item.score}
        </span>
      </Link>
    </li>
  );
}

export default async function HeadToHeadPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/u/${username}/vs`);
  if (user.id === profile.id) redirect(`/u/${username}`);

  const them = profile.display_name || profile.username;
  const head = await getHeadToHead(profile.id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <div className="mb-7 flex items-center gap-3">
        <Avatar url={profile.avatar_url} name={them} size="lg" />
        <div className="min-w-0">
          <h1 className="display text-2xl leading-tight">You vs {them}</h1>
          <Link
            href={`/u/${profile.username}`}
            className="text-sm text-text-muted underline-offset-4 hover:text-accent hover:underline"
          >
            @{profile.username}
          </Link>
        </div>
      </div>

      {!head || !head.ready ? (
        <EmptyState
          title="Not enough in common yet"
          body={
            `You and ${them} have ${head?.shared ?? 0} of ${MINIMUM} in common. ` +
            `Once you get there, this fills up with where you agree and where you really don't.`
          }
          action={
            <ButtonLink href="/stack">Rate some records</ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <div className="rounded-xl border border-border bg-surface/60 px-5 py-5">
              <p className="flex items-baseline gap-2.5">
                <span className="display text-4xl text-accent">{head.percent}%</span>
                <span className="text-sm text-text-secondary">in tune</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                {[
                  ["Both rated", head.shared],
                  ["Dead on", head.identical],
                  ["Within a point", head.close],
                  ["3+ apart", head.apart],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-xs text-text-muted">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {head.clashes.length > 0 && (
            <section>
              <SectionHeading>Where you fall out</SectionHeading>
              <ul className="-mx-2 flex flex-col">
                {head.clashes.map((item) => (
                  <ClashRow key={item.href} item={item} theirName={them} />
                ))}
              </ul>
            </section>
          )}

          {head.agreements.length > 0 && (
            <section>
              <SectionHeading>Common ground</SectionHeading>
              <ul className="-mx-2 flex flex-col">
                {head.agreements.map((item) => (
                  <ClashRow key={item.href} item={item} theirName={them} />
                ))}
              </ul>
            </section>
          )}

          {head.fromThem.length > 0 && (
            <section>
              <SectionHeading>
                {`They rate these highly. You haven't rated them.`}
              </SectionHeading>
              <ul className="-mx-2 flex flex-col">
                {head.fromThem.map((item) => (
                  <SpotRow key={item.href} item={item} />
                ))}
              </ul>
            </section>
          )}

          {head.fromYou.length > 0 && (
            <section>
              <SectionHeading>{`Put them on to these`}</SectionHeading>
              <ul className="-mx-2 flex flex-col">
                {head.fromYou.map((item) => (
                  <SpotRow key={item.href} item={item} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
