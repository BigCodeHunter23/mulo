import Link from "next/link";
import type { DiaryOwn, DiarySourceStatus } from "@/lib/app-api";
import { SOURCE_NAME, type ImportSource } from "@/lib/diary-shared";
import { ConnectLastfm, RemoveSource } from "./SourceButtons";
import { ago, monthLabel, shortDate } from "./dates";

const quietLink =
  "text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline";

function Row({ children }: { children: React.ReactNode }) {
  return <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">{children}</li>;
}

/** Last.fm's line: connect it, or how it's getting on. Also on the import page. */
export function LastfmRow({
  status,
  keys,
}: {
  status: DiarySourceStatus | undefined;
  keys: boolean;
}) {
  // Without the website's keys there's nothing to connect to.
  if (!status && !keys) return null;
  if (!status || (status.state === "idle" && !status.lastfmUser)) {
    return (
      <Row>
        <p className="text-sm text-text-secondary">
          Last.fm keeps your diary in step with what you play, every hour.
        </p>
        {keys && <ConnectLastfm />}
      </Row>
    );
  }

  const who = status.lastfmUser ? `Last.fm (${status.lastfmUser})` : "Last.fm";
  const line =
    status.state === "importing"
      ? `Importing from Last.fm… ${status.reachedBack ? `back to ${monthLabel(status.reachedBack)}` : "starting"}`
      : status.state === "needs_reconnect"
        ? "Last.fm needs connecting again."
        : status.syncedAt
          ? `${who}, synced ${ago(status.syncedAt)}`
          : who;

  return (
    <Row>
      <p className="text-sm text-text">{line}</p>
      <div className="flex flex-wrap items-center gap-3">
        {status.state === "needs_reconnect" && keys && <ConnectLastfm again />}
        <RemoveSource source="lastfm" />
      </div>
    </Row>
  );
}

/** Spotify and Apple Music: a history uploaded once, from a file or the iPhone. */
function ImportRow({
  source,
  status,
}: {
  source: Exclude<ImportSource, "lastfm">;
  status: DiarySourceStatus | undefined;
}) {
  const name = SOURCE_NAME[source];
  if (status) {
    const count = status.lastCount ?? 0;
    const when = status.lastImportAt ? `, imported ${shortDate(status.lastImportAt)}` : "";
    return (
      <Row>
        <p className="text-sm text-text">
          {status.state === "importing"
            ? `Importing from ${name}…`
            : `${name}: ${count.toLocaleString("en")} album${count === 1 ? "" : "s"}${when}`}
        </p>
        <RemoveSource source={source} />
      </Row>
    );
  }
  return (
    <Row>
      {source === "spotify" ? (
        <Link href="/diary/import" className={quietLink}>
          Import from Spotify
        </Link>
      ) : (
        <p className="text-xs text-text-muted">Apple Music is in the iPhone app.</p>
      )}
    </Row>
  );
}

/** Where the owner's diary comes from, and the way to connect, import or let go of each. */
export default function DiarySources({ own }: { own: DiaryOwn }) {
  const status = (source: ImportSource) => own.sources.find((row) => row.source === source);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="display-sm text-lg text-text">Where it comes from</h2>
      <ul className="mt-3 divide-y divide-border">
        <LastfmRow status={status("lastfm")} keys={own.lastfm} />
        <ImportRow source="spotify" status={status("spotify")} />
        <ImportRow source="apple" status={status("apple")} />
      </ul>
    </section>
  );
}
