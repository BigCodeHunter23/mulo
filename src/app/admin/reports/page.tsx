import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/moderation";
import { buttonClass, EmptyState, SectionHeading } from "@/components/ui";
import { threadHref } from "@/lib/replies-shared";
import { replyWordsIn } from "@/lib/reported-reply";
import { removeList, removeReply, removeReview, removeTake, setReportStatus } from "./actions";

export const metadata: Metadata = {
  title: "Reports",
  robots: { index: false, follow: false },
};

type Rated = {
  id: number;
  score: number;
  review: string | null;
  profiles: { username: string } | null;
};

type ReportRow = {
  id: number;
  reason: string;
  detail: string | null;
  status: "open" | "reviewed" | "dismissed";
  created_at: string;
  reporter: { username: string } | null;
  reported: { username: string; display_name: string | null } | null;
  ratings: (Rated & { releases: { mbid: string; title: string } | null }) | null;
  artist_ratings: (Rated & { artists: { mbid: string; name: string } | null }) | null;
  /** Only there once takes on the Daily Versus exist. */
  versus_takes?: {
    id: number;
    body: string;
    profiles: { username: string } | null;
    versus_matchups: { day: string } | null;
  } | null;
  lists?: {
    id: number;
    title: string;
    description: string | null;
    profiles: { username: string } | null;
  } | null;
  /** Only there once replies exist (migration 0024). */
  replies?: {
    id: number;
    body: string;
    profiles: { username: string } | null;
    ratings: { id: number; release_mbid: string } | null;
    artist_ratings: { id: number; artist_mbid: string } | null;
    versus_takes: { id: number; versus_matchups: { day: string } | null } | null;
  } | null;
};

// Reports point at profiles twice (who reported, and who was reported), so
// each join names the foreign key it means.
const SELECT = `
  id, reason, detail, status, created_at,
  reporter:profiles!reports_reporter_id_fkey ( username ),
  reported:profiles!reports_reported_profile_id_fkey ( username, display_name ),
  ratings ( id, score, review, profiles ( username ), releases ( mbid, title ) ),
  artist_ratings ( id, score, review, profiles ( username ), artists ( mbid, name ) )
`;

const SELECT_WITH_TAKES = `${SELECT},
  versus_takes ( id, body, profiles ( username ), versus_matchups ( day ) )
`;

const SELECT_WITH_LISTS = `${SELECT_WITH_TAKES},
  lists ( id, title, description, profiles ( username ) )
`;

const SELECT_WITH_REPLIES = `${SELECT_WITH_LISTS},
  replies ( id, body, profiles ( username ), ratings ( id, release_mbid ), artist_ratings ( id, artist_mbid ), versus_takes ( id, versus_matchups ( day ) ) )
`;

/** Where a reported reply's thread is, when it can still be found. */
function replyThread(reply: NonNullable<ReportRow["replies"]>): string | null {
  if (reply.ratings) {
    return threadHref({ kind: "album", mbid: reply.ratings.release_mbid, id: reply.ratings.id });
  }
  if (reply.artist_ratings) {
    return threadHref({
      kind: "artist",
      mbid: reply.artist_ratings.artist_mbid,
      id: reply.artist_ratings.id,
    });
  }
  const day = reply.versus_takes?.versus_matchups?.day;
  return reply.versus_takes && day
    ? threadHref({ kind: "take", day, id: reply.versus_takes.id })
    : null;
}

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The private moderation inbox: what people have reported, what it points
 * at, and the three things to do about it. Only admins can open it; everyone
 * else gets a page that doesn't exist.
 */
export default async function ReportsInbox({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (!(await requireAdmin())) notFound();

  const { view } = await searchParams;
  const showAll = view === "all";

  const load = (select: string) => {
    const query = createAdminClient()
      .from("reports")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!showAll) query.eq("status", "open");
    return query;
  };

  // Before replies, takes or lists exist their joins fail, so fall back step by step.
  let { data, error } = await load(SELECT_WITH_REPLIES);
  if (error) ({ data, error } = await load(SELECT_WITH_LISTS));
  if (error) ({ data, error } = await load(SELECT_WITH_TAKES));
  if (error) ({ data, error } = await load(SELECT));
  // The select is chosen at runtime, so its shape can't be inferred; ReportRow
  // spells out the fullest one, with the later joins optional.
  const reports = (data ?? []) as unknown as ReportRow[];

  const tab = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"
    }`;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <SectionHeading
        action={
          <div className="flex gap-1">
            <Link href="/admin/reports" className={tab(!showAll)}>
              Open
            </Link>
            <Link href="/admin/reports?view=all" className={tab(showAll)}>
              All
            </Link>
          </div>
        }
      >
        Reports
      </SectionHeading>

      {error ? (
        <p className="text-sm text-score-you">Couldn&rsquo;t load reports: {error.message}</p>
      ) : reports.length === 0 ? (
        <EmptyState
          title={showAll ? "No reports yet" : "Nothing to review"}
          body={
            showAll
              ? "When somebody reports a review, a reply or a profile, it lands here."
              : "Every report has been dealt with."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => {
            const rating = report.ratings ?? report.artist_ratings;
            const kind = report.ratings ? "album" : "artist";
            // Every other target takes its reports with it, so a report with
            // nothing attached is about a reply that's gone (migration 0024).
            const attached =
              report.replies ?? report.lists ?? report.versus_takes ?? report.reported ?? rating;
            const kept = report.replies || !attached ? replyWordsIn(report.detail) : null;
            const said = kept ? kept.said : report.detail;
            const subject = report.ratings
              ? report.ratings.releases && {
                  title: report.ratings.releases.title,
                  href: `/album/${report.ratings.releases.mbid}`,
                }
              : report.artist_ratings?.artists && {
                  title: report.artist_ratings.artists.name,
                  href: `/artist/${report.artist_ratings.artists.mbid}`,
                };

            return (
              <li key={report.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-score-you/15 px-2.5 py-0.5 font-medium text-score-you">
                    {report.reason}
                  </span>
                  {report.status !== "open" && (
                    <span className="rounded-full bg-surface-raised px-2.5 py-0.5 text-text-muted">
                      {report.status}
                    </span>
                  )}
                  <span className="text-text-muted">
                    by @{report.reporter?.username ?? "deleted account"} ·{" "}
                    {timeAgo(report.created_at)}
                  </span>
                </div>

                <div className="mt-3 text-sm text-text-secondary">
                  {report.replies ? (
                    <>
                      <p>
                        @{report.replies.profiles?.username ?? "unknown"}&rsquo;s{" "}
                        {replyThread(report.replies) ? (
                          <Link
                            href={replyThread(report.replies) ?? "#"}
                            className="font-medium text-text hover:text-accent"
                          >
                            reply
                          </Link>
                        ) : (
                          "reply"
                        )}
                      </p>
                      <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-text">
                        {report.replies.body}
                      </blockquote>
                    </>
                  ) : report.lists ? (
                    <>
                      <p>
                        @{report.lists.profiles?.username ?? "unknown"}&rsquo;s list{" "}
                        <Link
                          href={`/lists/${report.lists.id}`}
                          className="font-medium text-text hover:text-accent"
                        >
                          {report.lists.title}
                        </Link>
                      </p>
                      {report.lists.description && (
                        <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-text">
                          {report.lists.description}
                        </blockquote>
                      )}
                    </>
                  ) : report.versus_takes ? (
                    <>
                      <p>
                        @{report.versus_takes.profiles?.username ?? "unknown"}&rsquo;s take on the{" "}
                        {report.versus_takes.versus_matchups ? (
                          <Link
                            href={`/versus/${report.versus_takes.versus_matchups.day}`}
                            className="font-medium text-text hover:text-accent"
                          >
                            Daily Versus
                          </Link>
                        ) : (
                          "Daily Versus"
                        )}
                      </p>
                      <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-text">
                        {report.versus_takes.body}
                      </blockquote>
                    </>
                  ) : report.reported ? (
                    <p>
                      Profile:{" "}
                      <Link
                        href={`/u/${report.reported.username}`}
                        className="font-medium text-text hover:text-accent"
                      >
                        {report.reported.display_name || report.reported.username} (@
                        {report.reported.username})
                      </Link>
                    </p>
                  ) : rating ? (
                    <>
                      <p>
                        @{rating.profiles?.username ?? "unknown"}&rsquo;s{" "}
                        <span className="tabular-nums text-score-you">{rating.score}/10</span> for{" "}
                        {subject ? (
                          <Link
                            href={subject.href}
                            className="font-medium text-text hover:text-accent"
                          >
                            {subject.title}
                          </Link>
                        ) : (
                          "something no longer in the catalogue"
                        )}
                      </p>
                      <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-text">
                        {rating.review ?? (
                          <span className="text-text-muted">
                            No review text (already removed, or never written)
                          </span>
                        )}
                      </blockquote>
                    </>
                  ) : kept ? (
                    <>
                      <p className="text-text-muted">Reply removed</p>
                      <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-text">
                        {kept.words}
                      </blockquote>
                    </>
                  ) : (
                    <p className="text-text-muted">What was reported has since been deleted.</p>
                  )}

                  {said && (
                    <p className="mt-2 text-xs italic text-text-muted">&ldquo;{said}&rdquo;</p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {report.replies && (
                    <form action={removeReply.bind(null, report.replies.id)}>
                      <button type="submit" className={buttonClass({ size: "sm" })}>
                        Remove reply
                      </button>
                    </form>
                  )}
                  {report.lists && (
                    <form action={removeList.bind(null, report.lists.id)}>
                      <button type="submit" className={buttonClass({ size: "sm" })}>
                        Remove list
                      </button>
                    </form>
                  )}
                  {report.versus_takes && (
                    <form action={removeTake.bind(null, report.versus_takes.id)}>
                      <button type="submit" className={buttonClass({ size: "sm" })}>
                        Remove take
                      </button>
                    </form>
                  )}
                  {rating?.review && (
                    <form action={removeReview.bind(null, kind, rating.id)}>
                      <button type="submit" className={buttonClass({ size: "sm" })}>
                        Remove review
                      </button>
                    </form>
                  )}
                  {report.status !== "reviewed" && (
                    <form action={setReportStatus.bind(null, report.id, "reviewed")}>
                      <button
                        type="submit"
                        className={buttonClass({ variant: "secondary", size: "sm" })}
                      >
                        Mark reviewed
                      </button>
                    </form>
                  )}
                  {report.status === "open" ? (
                    <form action={setReportStatus.bind(null, report.id, "dismissed")}>
                      <button
                        type="submit"
                        className={buttonClass({ variant: "ghost", size: "sm" })}
                      >
                        Dismiss
                      </button>
                    </form>
                  ) : (
                    <form action={setReportStatus.bind(null, report.id, "open")}>
                      <button
                        type="submit"
                        className={buttonClass({ variant: "ghost", size: "sm" })}
                      >
                        Reopen
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
