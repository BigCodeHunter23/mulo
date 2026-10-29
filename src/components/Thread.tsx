import Link from "next/link";
import type { ThreadHead, ThreadPage } from "@/lib/app-api";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";
import { THREAD_GONE } from "@/lib/replies-shared";
import Avatar from "@/components/Avatar";
import LoginLink from "@/components/LoginLink";
import Reactions from "@/components/Reactions";
import ThreadReplies from "@/components/ThreadReplies";
import { ButtonLink, buttonClass, EmptyState, SectionHeading } from "@/components/ui";

type Open = Extract<ThreadPage, { state: "open" }>;

const PAGE = "mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-8 sm:px-6";

/** The record or matchup a thread is about, to go back to. */
export function backTo(head: ThreadHead): { href: string; label: string; sub: string | null } {
  if (head.kind === "album") {
    return {
      href: `/album/${head.release.mbid}`,
      label: head.release.title,
      sub: head.release.artist?.name ?? null,
    };
  }
  if (head.kind === "artist") {
    return { href: `/artist/${head.artist.mbid}`, label: head.artist.name, sub: "Artist" };
  }
  return {
    href: `/versus/${head.matchup.day}`,
    label: head.matchup.title,
    sub: `${head.matchup.left.name} vs ${head.matchup.right.name}`,
  };
}

function Record({ head }: { head: ThreadHead }) {
  const { href, label, sub } = backTo(head);
  const art =
    head.kind === "album"
      ? coverSrc(head.release.cover_art_url, 250)
      : head.kind === "artist"
        ? artistPhotoSrc(head.artist.image_url, 200)
        : null;
  return (
    <Link href={href} className="group flex items-center gap-3">
      {art && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt=""
          className={`h-12 w-12 shrink-0 object-cover ${head.kind === "artist" ? "rounded-full object-top" : "rounded-md"}`}
        />
      )}
      <span className="min-w-0">
        <span className="display-sm block truncate text-base text-text transition-colors group-hover:text-accent">
          {label}
        </span>
        {sub && <span className="block truncate text-sm text-text-secondary">{sub}</span>}
      </span>
    </Link>
  );
}

/** The review or take on top, with its score and reactions. */
function Head({ head, signedIn }: { head: ThreadHead; signedIn: boolean }) {
  const author = head.kind === "take" ? head.take.author : head.author;
  const name = author.display_name || author.username;
  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <Avatar url={author.avatar_url} name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/u/${author.username}`}
            className="block truncate text-sm font-medium text-text transition-colors hover:text-accent"
          >
            {name}
          </Link>
          <span className="text-xs text-text-muted">
            {head.kind === "take" && head.take.side
              ? `Picked ${head.matchup[head.take.side].name}`
              : `@${author.username}`}
          </span>
        </div>
        {head.kind !== "take" && (
          <span className="display-sm shrink-0 tabular-nums text-score-you">
            {head.score}
            <span className="text-xs text-text-muted">/10</span>
          </span>
        )}
      </div>
      <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-text-secondary">
        {head.kind === "take" ? head.take.body : head.review}
      </p>
      <div className="mt-3.5">
        {head.kind === "take" ? (
          <Reactions
            kind="take"
            ratingId={head.take.id}
            summary={head.take.reactions}
            signedIn={signedIn}
            readOnly={head.take.mine}
          />
        ) : (
          <Reactions
            kind={head.kind}
            ratingId={head.ratingId}
            summary={head.reaction}
            signedIn={signedIn}
          />
        )}
      </div>
    </article>
  );
}

/** A thread page: the record, the review or take, then its replies and the box. */
export default function Thread({ page, signedIn }: { page: Open; signedIn: boolean }) {
  const { head } = page;
  return (
    <main className={PAGE}>
      <Record head={head} />
      <div className="mt-6">
        <Head head={head} signedIn={signedIn} />
      </div>
      <section className="mt-10">
        <SectionHeading>Replies</SectionHeading>
        {!signedIn ? (
          <EmptyState
            title="Log in to read the replies"
            body="Replies are for people with an account."
            action={<LoginLink className={buttonClass({ size: "sm" })}>Log in</LoginLink>}
          />
        ) : !page.available ? (
          <p className="text-sm text-text-muted">Replies aren&rsquo;t available yet.</p>
        ) : (
          <ThreadReplies
            kind={head.kind}
            targetId={head.kind === "take" ? head.take.id : head.ratingId}
            initial={page.replies}
            canReply={page.canReply}
          />
        )}
      </section>
    </main>
  );
}

/** A thread whose review or take is gone, or hidden from you. */
export function ThreadGone({ back }: { back: string }) {
  return (
    <main className={PAGE}>
      <EmptyState
        title={THREAD_GONE}
        action={
          <ButtonLink href={back} variant="secondary">
            Go back
          </ButtonLink>
        }
      />
    </main>
  );
}

/** A take on today's Versus, before you've picked. */
export function ThreadLocked({ day }: { day: string }) {
  return (
    <main className={PAGE}>
      <EmptyState
        title="Pick a side to read this take"
        body="Takes on today's Versus open up once you've picked, so nobody gets talked into a side."
        action={<ButtonLink href={`/versus/${day}`}>Pick a side</ButtonLink>}
      />
    </main>
  );
}
