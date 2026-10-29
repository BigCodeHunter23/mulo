import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { coverSrc } from "@/lib/cover-url";
import { foldName, IMPORT_SOURCES, SOURCE_NAME, withoutEdition } from "@/lib/diary-shared";
import { searchCatalog, type SearchAlbum } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable, logQueryError } from "@/lib/supabase/errors";
import { rowIdText } from "@/lib/validation";
import CoverImage from "@/components/CoverImage";
import { EmptyState, fieldClass, buttonClass } from "@/components/ui";
import ThisOne from "./ThisOne";

export const metadata: Metadata = { title: "Which album is this?" };

type Entry = { id: number; artist_name: string; album_name: string; sources: string[] };

/** One of your own entries, or null for somebody else's, one that's gone, or before 0025. */
async function yourEntry(userId: string, id: number): Promise<Entry | null> {
  const { data, error } = await createAdminClient()
    .from("diary_entries")
    .select("id, artist_name, album_name, sources")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error && !isMissingTable(error)) logQueryError("diary", error);
  return data;
}

/** "from your Spotify history", for an entry an import brought in. */
function whereFrom(sources: string[]): string {
  const source = IMPORT_SOURCES.find((name) => sources.includes(name));
  return source ? `, from your ${SOURCE_NAME[source]} history` : "";
}

/**
 * "Which album is this?": the names an entry came with, and a search of
 * MULO's albums to pick the right one. Picking it fixes every entry of yours
 * with those names, never anybody else's.
 */
export default async function FixAlbumPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ id: idText }, { q }] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/diary/fix/${encodeURIComponent(idText)}`);
  const id = rowIdText.safeParse(idText);
  if (!id.success) notFound();
  const entry = await yourEntry(user.id, id.data);
  if (!entry) notFound();

  // MULO's search reads a title or an artist, not both at once, so it starts from the title.
  const query = (q ?? withoutEdition(entry.album_name)).trim().slice(0, 80);
  const artist = foldName(entry.artist_name);
  const found = query.length >= 2 ? (await searchCatalog(query, 12)).albums : [];
  // Theirs first: the right album is nearly always by the artist the names give.
  const albums = [
    ...found.filter((album) => foldName(album.artist ?? "") === artist),
    ...found.filter((album) => foldName(album.artist ?? "") !== artist),
  ];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <Link href="/diary" className="text-sm text-text-secondary transition-colors hover:text-text">
        ← Your diary
      </Link>
      <h1 className="display mt-3 text-3xl text-text">Which album is this?</h1>
      <p className="mt-2 text-sm text-text-secondary">
        <span className="text-text">{entry.album_name}</span> by{" "}
        <span className="text-text">{entry.artist_name}</span>
        {whereFrom(entry.sources)}.
      </p>

      <form
        action={`/diary/fix/${entry.id}`}
        method="get"
        role="search"
        className="mt-6 flex gap-2"
      >
        <label htmlFor="fix-q" className="sr-only">
          Search albums
        </label>
        <input
          id="fix-q"
          name="q"
          type="search"
          defaultValue={query}
          className={fieldClass}
          autoComplete="off"
        />
        <button type="submit" className={buttonClass({ variant: "secondary" })}>
          Search
        </button>
      </form>

      <div className="mt-6">
        {albums.length === 0 ? (
          <EmptyState
            title="No albums found"
            body="Try the album's name another way, or just the artist."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {albums.map((album) => (
              <Result key={album.mbid} album={album} entryId={entry.id} />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-6 text-xs text-text-muted">
        Not here?{" "}
        <Link
          href={`/search?q=${encodeURIComponent(query)}`}
          className="text-text-secondary underline-offset-4 hover:text-text hover:underline"
        >
          Search the wider music database
        </Link>
        , open the album, then come back and pick it.
      </p>
    </main>
  );
}

function Result({ album, entryId }: { album: SearchAlbum; entryId: number }) {
  const detail = [album.artist, album.year].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-raised">
        <CoverImage
          src={coverSrc(album.cover_art_url, 250)}
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={`/album/${album.mbid}`}
          className="block truncate text-sm font-medium text-text transition-colors hover:text-accent"
        >
          {album.title}
        </Link>
        {detail && <p className="truncate text-xs text-text-muted">{detail}</p>}
      </div>
      <ThisOne entryId={entryId} mbid={album.mbid} title={album.title} />
    </li>
  );
}
