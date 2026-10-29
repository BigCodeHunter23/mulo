import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { lastfmKeys } from "@/lib/diary/lastfm";
import { getOwnDiary } from "@/lib/diary/read";
import { LastfmRow } from "@/components/diary/DiarySources";
import { ConnectLastfm } from "@/components/diary/SourceButtons";
import SpotifyImport from "./SpotifyImport";

export const metadata: Metadata = { title: "Import your listening" };

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="display-sm text-lg text-text">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Bringing your listening into the diary: Last.fm, connected once and kept in
 * step every hour, and Spotify's extended streaming history, read in this
 * browser. Apple Music is read by the iPhone app.
 */
export default async function ImportPage() {
  const user = await requireUser("/diary/import");
  const own = await getOwnDiary(user.id);
  const keys = own ? own.lastfm : lastfmKeys() !== null;
  const lastfm = own?.sources.find((source) => source.source === "lastfm");
  // As the diary's own Last.fm line counts it: a row left from before is no connection.
  const connected = lastfm !== undefined && !(lastfm.state === "idle" && !lastfm.lastfmUser);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-8">
        <Link
          href="/diary"
          className="text-sm text-text-secondary transition-colors hover:text-text"
        >
          ← Your diary
        </Link>
        <h1 className="display mt-3 text-3xl text-text sm:text-4xl">Import your listening</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Each album you played on a day goes in your diary: four of its songs, or twenty minutes of
          it.
        </p>
      </header>

      <div className="flex flex-col gap-5">
        {(keys || connected) && (
          <Part title="Last.fm">
            <p className="mb-3 text-sm text-text-secondary">
              Your whole Last.fm history comes in, then new plays every hour.
            </p>
            {connected ? (
              <ul>
                <LastfmRow status={lastfm} keys={keys} />
              </ul>
            ) : (
              <ConnectLastfm />
            )}
          </Part>
        )}

        <Part title="Spotify">
          <ol className="mb-5 flex list-decimal flex-col gap-2 pl-5 text-sm text-text-secondary marker:text-text-muted">
            <li>
              On Spotify&rsquo;s website, open Account &rarr; Privacy settings &rarr; Download your
              data.
            </li>
            <li>
              Tick <span className="font-semibold text-text">Extended streaming history</span> (not
              Account data, which has no album names) and ask for it.
            </li>
            <li>
              Spotify emails a zip, which can take up to 30 days. Pick that zip here. The file stays
              on this device: only the albums are sent.
            </li>
          </ol>
          <SpotifyImport isPublic={own?.public ?? true} />
        </Part>

        <Part title="Apple Music">
          <p className="text-sm text-text-secondary">
            Apple Music&rsquo;s library is read by the iPhone app.
          </p>
        </Part>
      </div>
    </main>
  );
}
