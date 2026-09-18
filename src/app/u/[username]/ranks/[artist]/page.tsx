import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedArtist } from "@/lib/catalog";
import { getRanking, type RankedAlbum } from "@/lib/gauntlet";
import { getProfileByUsername } from "@/lib/social";
import { getCurrentUser } from "@/lib/supabase/server";
import { coverSrc } from "@/lib/cover-url";
import { Crown, Sparks } from "@/components/Celebrate";
import ShareButton from "@/components/ShareButton";
import { ButtonLink } from "@/components/ui";

type Params = Promise<{ username: string; artist: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username, artist: mbid } = await params;
  const artist = await getCachedArtist(mbid);
  const title = artist ? `${username}'s ${artist.name} ranking` : "Ranking";
  return { title, description: `Every ${artist?.name ?? ""} album, ranked by ${username} on MULO.` };
}

function Cover({ album, className }: { album: RankedAlbum; className: string }) {
  const src = coverSrc(album.cover, 500);
  return (
    <div className={`artwork overflow-hidden rounded-xl shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] ${className}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={album.title} className="h-full w-full object-cover" />
      )}
    </div>
  );
}

/** One place on the podium. The winner stands tallest and wears the crown. */
function Podium({ album, place }: { album: RankedAlbum; place: 1 | 2 | 3 }) {
  const first = place === 1;
  return (
    <Link
      href={`/album/${album.mbid}`}
      className={`deal-in group flex min-w-0 flex-col items-center text-center ${
        first ? "order-2 -mt-6" : place === 2 ? "order-1 mt-6" : "order-3 mt-10"
      }`}
      style={{ "--delay": `${first ? 0.45 : place === 2 ? 0.2 : 0.3}s` } as React.CSSProperties}
    >
      <div className="relative">
        {first && (
          <>
            <Sparks count={14} reach={90} delay={1} />
            <span className="crown-drop absolute -top-7 left-1/2 z-10 -translate-x-1/2">
              <Crown className="h-9 w-9" />
            </span>
          </>
        )}
        <Cover
          album={album}
          className={`transition-transform duration-300 group-hover:-translate-y-1 ${
            first ? "h-32 w-32 sm:h-44 sm:w-44" : "h-24 w-24 sm:h-32 sm:w-32"
          }`}
        />
        <span
          className={`absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full border-2 font-bold tabular-nums shadow-lg ${
            first
              ? "h-10 w-10 border-score-overall bg-score-overall text-lg text-bg"
              : "h-8 w-8 border-border-strong bg-surface-raised text-sm text-text"
          }`}
        >
          {place}
        </span>
      </div>
      <p className="display-sm mt-5 line-clamp-2 text-xs text-text transition-colors group-hover:text-accent sm:text-sm">
        {album.title}
      </p>
      <p className="mt-0.5 text-[11px] text-text-muted">
        <span className="font-semibold text-score-you">{album.score}</span>
        {album.year && ` · ${album.year}`}
      </p>
    </Link>
  );
}

/**
 * Somebody's ranking of an artist's whole discography: the three best on a
 * podium, the rest in order underneath. Made to be sent to somebody who'll
 * disagree with it.
 */
export default async function RankingPage({ params }: { params: Params }) {
  const { username, artist: mbid } = await params;

  const [profile, artist] = await Promise.all([
    getProfileByUsername(username),
    getCachedArtist(mbid),
  ]);
  if (!profile || !artist) notFound();

  const [{ ranked, total }, viewer] = await Promise.all([
    getRanking(profile.id, mbid),
    getCurrentUser(),
  ]);

  const name = profile.display_name || profile.username;
  const isSelf = viewer?.id === profile.id;
  const [first, second, third] = ranked;
  const rest = ranked.slice(3);
  const complete = ranked.length === total && total > 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          {complete ? "The full discography" : `${ranked.length} of ${total} albums`}
        </p>
        <h1 className="display mt-2 text-3xl text-text sm:text-5xl">
          {isSelf ? "Your" : `${name}'s`} {artist.name} ranking
        </h1>
      </header>

      {ranked.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-sm text-text-secondary">
            {isSelf
              ? `You haven't rated any ${artist.name} albums yet.`
              : `${name} hasn't rated any ${artist.name} albums yet.`}
          </p>
          <div className="mt-5">
            <ButtonLink href={`/artist/${mbid}/gauntlet`}>Run the Gauntlet</ButtonLink>
          </div>
        </div>
      ) : (
        <>
          {/* The top three, winner in the middle */}
          <div className="mt-14 grid grid-cols-3 items-start gap-3 sm:gap-6">
            {first && <Podium album={first} place={1} />}
            {second && <Podium album={second} place={2} />}
            {third && <Podium album={third} place={3} />}
          </div>

          {rest.length > 0 && (
            <ol className="mt-12 flex flex-col gap-2">
              {rest.map((album, i) => (
                <li
                  key={album.mbid}
                  className="deal-in"
                  style={{ "--delay": `${0.6 + i * 0.05}s` } as React.CSSProperties}
                >
                  <Link
                    href={`/album/${album.mbid}`}
                    className="group flex items-center gap-4 rounded-xl border border-border bg-surface/60 p-2.5 pr-4 transition-colors hover:border-border-strong"
                  >
                    <span className="display w-8 text-center text-xl tabular-nums text-text-muted">
                      {i + 4}
                    </span>
                    <Cover album={album} className="h-12 w-12 shrink-0 rounded-md" />
                    <span className="min-w-0 flex-1">
                      <span className="display-sm block truncate text-sm text-text transition-colors group-hover:text-accent">
                        {album.title}
                      </span>
                      {album.year && <span className="text-xs text-text-muted">{album.year}</span>}
                    </span>
                    <span className="display-sm text-lg tabular-nums text-score-you">{album.score}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <ShareButton
              url={`/u/${profile.username}/ranks/${mbid}`}
              title={`${name}'s ${artist.name} ranking`}
              text={first ? `${first.title} on top. Fight me.` : undefined}
              label="Share ranking"
            />
            {isSelf && !complete && (
              <ButtonLink href={`/artist/${mbid}/gauntlet`}>Finish the Gauntlet</ButtonLink>
            )}
            {!isSelf && (
              <ButtonLink href={`/artist/${mbid}/gauntlet`} variant="secondary">
                Make your own
              </ButtonLink>
            )}
          </div>
        </>
      )}
    </main>
  );
}
