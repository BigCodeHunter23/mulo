import Link from "next/link";
import { getTakes } from "@/lib/versus-takes";
import type { VersusMatchup, VersusSideKey } from "@/lib/versus-shared";
import Avatar from "@/components/Avatar";
import Reactions from "@/components/Reactions";
import ReportButton from "@/components/ReportButton";
import { ButtonLink, SectionHeading } from "@/components/ui";
import { DeleteTake, TakeComposer } from "./TakeControls";

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * What people are saying about a matchup. Like the split, the takes stay
 * hidden until you've picked, so nobody gets talked into a side; once it
 * closes, anyone can read them.
 */
export default async function Takes({
  matchup,
  mine,
  signedIn,
  closed,
}: {
  matchup: VersusMatchup;
  mine: VersusSideKey | null;
  signedIn: boolean;
  closed: boolean;
}) {
  const { available, takes } = await getTakes(matchup.id);
  if (!available) return null;

  const count = takes.length;
  const heading = (
    <SectionHeading
      action={
        count > 0 ? (
          <span className="text-xs text-text-muted">
            {count} {count === 1 ? "take" : "takes"}
          </span>
        ) : undefined
      }
    >
      Takes
    </SectionHeading>
  );

  if (!closed && mine === null) {
    return (
      <section className="mt-12">
        {heading}
        <div className="rounded-xl border border-dashed border-border bg-surface/40 px-5 py-6 text-center">
          <p className="text-sm text-text-secondary">
            {count > 0
              ? `${count} ${count === 1 ? "person has" : "people have"} made their case. Pick a side to read ${count === 1 ? "it" : "them"} and add yours.`
              : "Pick a side, then make your case."}
          </p>
          {!signedIn && (
            <div className="mt-4">
              <ButtonLink href="/login" size="sm">
                Log in to pick
              </ButtonLink>
            </div>
          )}
        </div>
      </section>
    );
  }

  const posted = takes.some((take) => take.mine);

  return (
    <section className="mt-12">
      {heading}

      {mine && !posted && (
        <div className="mb-4">
          <TakeComposer matchupId={matchup.id} pickedName={matchup[mine].name} />
        </div>
      )}

      {count === 0 ? (
        <p className="text-sm text-text-muted">
          {closed ? "Nobody made a case on this one." : "No takes yet. Get the first word in."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {takes.map((take) => {
            const name = take.author.display_name || take.author.username;
            return (
              <li key={take.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  <Link href={`/u/${take.author.username}`} className="shrink-0">
                    <Avatar url={take.author.avatar_url} name={name} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <Link
                        href={`/u/${take.author.username}`}
                        className="font-medium text-text transition-colors hover:text-accent"
                      >
                        {name}
                      </Link>
                      {take.side && (
                        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                          Picked {matchup[take.side].name}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">{timeAgo(take.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-text-secondary">
                      {take.body}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Reactions
                        kind="take"
                        ratingId={take.id}
                        summary={take.reactions}
                        signedIn={signedIn}
                        readOnly={take.mine}
                      />
                      {take.mine ? (
                        <DeleteTake takeId={take.id} />
                      ) : (
                        <ReportButton takeId={take.id} signedIn={signedIn} />
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
