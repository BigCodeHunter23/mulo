import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { DiaryEntry, DiaryMonth, DiaryOwn } from "@/lib/app-api";
import { diaryHref, monthLine } from "@/lib/diary-shared";
import { getDiaryPage } from "@/lib/diary/read";
import DiaryEntryRow from "@/components/diary/DiaryEntryRow";
import DiaryPrivacy from "@/components/diary/DiaryPrivacy";
import DiarySources from "@/components/diary/DiarySources";
import { monthLabel } from "@/components/diary/dates";
import { ButtonLink, EmptyState, Notice } from "@/components/ui";

type Params = Promise<{ username: string }>;
type Search = Promise<{ before?: string; lastfm?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = await getDiaryPage((await params).username, null);
  if (!page) return { title: "Diary" };
  return { title: `${page.person.display_name || page.person.username}'s diary` };
}

/** Entries in their months, newest first, as the page already has them. */
function byMonth(entries: DiaryEntry[]): { month: string; entries: DiaryEntry[] }[] {
  const groups: { month: string; entries: DiaryEntry[] }[] = [];
  for (const entry of entries) {
    const month = entry.day.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.entries.push(entry);
    else groups.push({ month, entries: [entry] });
  }
  return groups;
}

/** What Last.fm's way back said, when it's just sent the owner here. */
function LastfmNotice({ outcome }: { outcome: string | undefined }) {
  if (outcome === "connected") {
    return (
      <Notice tone="info">
        Last.fm is connected. Your history is coming in; it can take a few hours.
      </Notice>
    );
  }
  if (outcome === "failed") {
    return <Notice tone="error">Couldn&rsquo;t connect Last.fm. Please try again.</Notice>;
  }
  return null;
}

/** The owner's own corner: who can see it, where it comes from, and what's waiting. */
function OwnTools({ own, entries }: { own: DiaryOwn; entries: DiaryEntry[] }) {
  const imported =
    own.sources.some((source) => source.lastImportAt !== null) ||
    entries.some((entry) => entry.sources.some((source) => source !== "hand"));

  return (
    <div className="mb-10 flex flex-col gap-4">
      <DiaryPrivacy askFirst={imported} isPublic={own.public} />

      {own.waiting > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm text-text">
            <span className="font-semibold">
              {own.waiting.toLocaleString("en")} album{own.waiting === 1 ? "" : "s"} waiting for a
              score
            </span>
          </p>
          <ButtonLink href="/stack?from=listening" size="sm">
            Rate them in The Stack
          </ButtonLink>
        </section>
      )}

      <DiarySources own={own} />

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/search" variant="secondary" size="sm">
          Log a listen
        </ButtonLink>
        <ButtonLink href="/diary/import" variant="secondary" size="sm">
          Import your history
        </ButtonLink>
      </div>
    </div>
  );
}

function Months({
  entries,
  months,
  own,
}: {
  entries: DiaryEntry[];
  months: DiaryMonth[];
  own: boolean;
}) {
  const lines = new Map(months.map((month) => [month.month, month]));
  return (
    <div className="flex flex-col gap-8">
      {byMonth(entries).map((group) => {
        const line = lines.get(group.month);
        return (
          <section key={group.month} aria-label={monthLabel(group.month)}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2.5">
              <h2 className="display-sm text-lg text-text">{monthLabel(group.month)}</h2>
              {line && (
                <p className="text-xs text-text-muted">{monthLine(line.albums, line.minutes)}</p>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {group.entries.map((entry) => (
                <DiaryEntryRow key={entry.id} entry={entry} own={own} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Somebody's listening diary: an album on a day, newest first, a page at a
 * time. Public unless they've made it private; the owner also gets where it
 * comes from, who can see it, and what's waiting for a score.
 */
export default async function DiaryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const [{ username }, { before, lastfm }] = await Promise.all([params, searchParams]);
  const page = await getDiaryPage(username, before ?? null);
  if (!page) notFound();

  const person = page.person;
  const name = person.display_name || person.username;
  const profile = `/u/${person.username}`;

  const header = (
    <header className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Diary</p>
      <h1 className="display mt-2 text-3xl text-text sm:text-4xl">{name}</h1>
      <Link
        href={profile}
        className="mt-1 inline-block text-sm text-text-secondary transition-colors hover:text-text"
      >
        ← @{person.username}
      </Link>
    </header>
  );

  if (page.state !== "open") {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
        {header}
        {page.state === "private" ? (
          <EmptyState
            title="This diary is private."
            action={
              <ButtonLink href={profile} variant="secondary">
                Back to {name}
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState title="The diary isn't available yet." />
        )}
      </main>
    );
  }

  const own = page.own;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      {header}

      {own && lastfm && (
        <div className="mb-6">
          <LastfmNotice outcome={lastfm} />
        </div>
      )}

      {own && !before && <OwnTools own={own} entries={page.entries} />}

      {page.entries.length === 0 ? (
        own ? (
          <EmptyState
            title="Your diary is empty."
            body="Bring in what you've played, or log an album you've just heard."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/diary/import">Import your history</ButtonLink>
                <ButtonLink href="/search" variant="secondary">
                  Find an album
                </ButtonLink>
              </div>
            }
          />
        ) : (
          <EmptyState title="Nothing in this diary yet." />
        )
      ) : (
        <Months entries={page.entries} months={page.months} own={Boolean(own)} />
      )}

      {page.next && (
        <div className="mt-8 flex justify-center">
          <ButtonLink
            href={`${diaryHref(person.username)}?before=${encodeURIComponent(page.next)}`}
            variant="secondary"
          >
            Show older
          </ButtonLink>
        </div>
      )}
    </main>
  );
}
