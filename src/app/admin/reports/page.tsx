import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/moderation";
import { buttonClass, EmptyState, SectionHeading } from "@/components/ui";
import { removeReview, setReportStatus } from "./actions";

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

  const query = createAdminClient()
    .from("reports")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!showAll) query.eq("status", "open");

  const { data, error } = await query;
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
              ? "When somebody reports a review or a profile, it lands here."
              : "Every report has been dealt with."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => {
            const rating = report.ratings ?? report.artist_ratings;
            const kind = report.ratings ? "album" : "artist";
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
                  {report.reported ? (
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
                          <Link href={subject.href} className="font-medium text-text hover:text-accent">
                            {subject.title}
                          </Link>
                        ) : (
                          "something no longer in the catalogue"
                        )}
                      </p>
                      <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-text">
                        {rating.review ?? (
                          <span className="text-text-muted">No review text (already removed, or never written)</span>
                        )}
                      </blockquote>
                    </>
                  ) : (
                    <p className="text-text-muted">What was reported has since been deleted.</p>
                  )}

                  {report.detail && (
                    <p className="mt-2 text-xs italic text-text-muted">&ldquo;{report.detail}&rdquo;</p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {rating?.review && (
                    <form action={removeReview.bind(null, kind, rating.id)}>
                      <button type="submit" className={buttonClass({ size: "sm" })}>
                        Remove review
                      </button>
                    </form>
                  )}
                  {report.status !== "reviewed" && (
                    <form action={setReportStatus.bind(null, report.id, "reviewed")}>
                      <button type="submit" className={buttonClass({ variant: "secondary", size: "sm" })}>
                        Mark reviewed
                      </button>
                    </form>
                  )}
                  {report.status === "open" ? (
                    <form action={setReportStatus.bind(null, report.id, "dismissed")}>
                      <button type="submit" className={buttonClass({ variant: "ghost", size: "sm" })}>
                        Dismiss
                      </button>
                    </form>
                  ) : (
                    <form action={setReportStatus.bind(null, report.id, "open")}>
                      <button type="submit" className={buttonClass({ variant: "ghost", size: "sm" })}>
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
