import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfileByUsername } from "@/lib/social";
import { isHidden } from "@/lib/blocks";
import { ENOUGH_TO_JUDGE, getRatingStyle, type Standout } from "@/lib/rating-style";
import { coverSrc } from "@/lib/cover-url";
import ShareButton from "@/components/ShareButton";
import { ButtonLink, SectionHeading } from "@/components/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) return { title: "How they rate" };

  const name = profile.display_name || profile.username;
  return {
    title: `How ${name} rates`,
    description: `Where ${name} sits against everybody else on MULO: harsher or kinder, and the records they're furthest apart on.`,
  };
}

/** "1.2 harsher than everyone", in words anybody reads the same way. */
function verdict(gap: number) {
  const size = Math.abs(gap);
  if (size < 0.2) return { line: "dead on the crowd", tone: "text-text" };
  if (gap > 0) {
    return {
      line: `${size.toFixed(1)} kinder than everyone else`,
      tone: "text-score-overall",
    };
  }
  return { line: `${size.toFixed(1)} harsher than everyone else`, tone: "text-score-you" };
}

function Record({ standout, blurb }: { standout: Standout; blurb: string }) {
  const cover = coverSrc(standout.cover_art_url, 250);

  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">{blurb}</p>
      <Link href={`/album/${standout.mbid}`} className="group flex items-center gap-4">
        <span className="artwork h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-raised">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="display-sm block truncate text-base text-text transition-colors group-hover:text-accent">
            {standout.title}
          </span>
          {standout.artist && (
            <span className="block truncate text-sm text-text-secondary">{standout.artist}</span>
          )}
          <span className="mt-1.5 block text-sm tabular-nums">
            <span className="font-semibold text-score-you">{standout.yours}</span>
            <span className="text-text-muted"> to everyone&rsquo;s </span>
            <span className="font-semibold text-score-overall">{standout.theirs}</span>
          </span>
        </span>
      </Link>
    </div>
  );
}

function Leaning({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; gap: number; count: number }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;

  // The kindest and the hardest, which is the whole story; the middle isn't.
  const shown = rows.length === 1 ? rows : [rows[0], rows[rows.length - 1]];

  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">{title}</p>
      <ul className="flex flex-col gap-2">
        {shown.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-text">{row.label}</span>
            <span className="shrink-0 tabular-nums text-text-secondary">
              <span className={row.gap >= 0 ? "text-score-overall" : "text-score-you"}>
                {row.gap > 0 ? "+" : ""}
                {row.gap.toFixed(1)}
              </span>
              <span className="text-text-muted"> · {row.count} rated</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function TastePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const profile = await getProfileByUsername(username);
  if (!profile) notFound();
  if (await isHidden(profile.id)) notFound();

  const style = await getRatingStyle(profile.id);
  const name = profile.display_name || profile.username;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <Link
        href={`/u/${profile.username}`}
        className="text-sm text-text-secondary transition-colors hover:text-text"
      >
        ← {name}
      </Link>

      <h1 className="display mt-3 text-3xl text-text sm:text-4xl">How {name} rates</h1>

      {!style ? (
        <div className="mt-6">
          <p className="text-sm text-text-secondary">
            Not enough to go on yet. This fills in once {name} has rated {ENOUGH_TO_JUDGE} records
            that carry a score to measure against.
          </p>
          <div className="mt-5">
            <ButtonLink href="/stack">Rate some records</ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
            <p className={`display text-5xl tabular-nums sm:text-6xl ${verdict(style.gap).tone}`}>
              {style.gap > 0 ? "+" : ""}
              {style.gap.toFixed(1)}
            </p>
            <p className="mt-2 text-sm text-text-secondary">{verdict(style.gap).line}</p>
            <p className="mt-4 text-xs text-text-muted">
              Across {style.compared} records with something to compare against, {name} averages{" "}
              <span className="font-semibold text-score-you">{style.yours.toFixed(1)}</span> where
              everybody else gives{" "}
              <span className="font-semibold text-score-overall">{style.everyone.toFixed(1)}</span>.
            </p>
            <div className="mt-5 flex justify-center">
              <ShareButton
                url={`/u/${profile.username}/taste`}
                title={`How ${name} rates on MULO`}
                text={`${verdict(style.gap).line}, across ${style.compared} records.`}
                label="Share this"
              />
            </div>
          </section>

          {(style.champion || style.sceptic) && (
            <section className="mt-12">
              <SectionHeading>Furthest from the crowd</SectionHeading>
              <div className="flex flex-col gap-7">
                {style.champion && (
                  <Record standout={style.champion} blurb={`${name} rates it far higher`} />
                )}
                {style.sceptic && (
                  <Record standout={style.sceptic} blurb={`${name} isn't having it`} />
                )}
              </div>
            </section>
          )}

          <section className="mt-12 grid gap-8 sm:grid-cols-2">
            <Leaning
              title="By decade"
              rows={style.decades}
              empty="Not enough rated in any one decade yet."
            />
            <Leaning
              title="By genre"
              rows={style.genres}
              empty="Not enough rated in any one genre yet."
            />
          </section>

          <p className="mt-10 text-xs text-text-muted">
            A plus means kinder than everyone else, a minus means harsher. Their own score is always
            left out of the crowd&rsquo;s, and on records MULO hasn&rsquo;t enough of its own scores
            for, the starting score from MusicBrainz stands in.
          </p>
        </>
      )}
    </main>
  );
}
