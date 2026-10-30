import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArtistCard from "@/components/ArtistCard";
import PersonRow from "@/components/PersonRow";
import { ButtonLink, EmptyState, Pager } from "@/components/ui";
import { listFollowedArtists } from "@/lib/artist-follows";
import { requireUser } from "@/lib/auth";
import { withQuery } from "@/lib/redirects";
import { getFollowingIds, getProfileByUsername, listFollows } from "@/lib/social";
import { pageNumber } from "@/lib/validation";

type Direction = "followers" | "following" | "artists";

const PAGE_SIZE = 50;

const TABS: [Direction, string][] = [
  ["followers", "Followers"],
  ["following", "Following"],
  ["artists", "Artists"],
];

function directionOf(value: string | undefined): Direction {
  return value === "following" || value === "artists" ? value : "followers";
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ show?: string }>;
}): Promise<Metadata> {
  const [{ username }, { show }] = await Promise.all([params, searchParams]);
  const direction = directionOf(show);
  const title =
    direction === "following"
      ? `Who ${username} follows`
      : direction === "artists"
        ? `Artists ${username} follows`
        : `${username}'s followers`;
  return { title };
}

const TAB = "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors";
const ON = "border-accent bg-accent-subtle text-accent";
const OFF =
  "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text";

type Shown = { profileId: string; username: string; name: string; page: number };

/** "That's everyone." past the last page, or what an empty list says. */
function Empty({
  page,
  username,
  show,
  title,
}: {
  page: number;
  username: string;
  show: Direction;
  title: string;
}) {
  return page > 1 ? (
    <EmptyState
      title="That's everyone."
      action={
        <ButtonLink href={`/u/${username}/follows?show=${show}`}>Back to the first page</ButtonLink>
      }
    />
  ) : (
    <EmptyState title={title} />
  );
}

async function People({
  profileId,
  username,
  name,
  page,
  direction,
  viewerId,
}: Shown & { direction: "followers" | "following"; viewerId: string }) {
  const [found, followingIds] = await Promise.all([
    listFollows(profileId, direction, { offset: (page - 1) * PAGE_SIZE, size: PAGE_SIZE + 1 }),
    getFollowingIds(viewerId),
  ]);
  const people = found.slice(0, PAGE_SIZE);
  const following = new Set(followingIds);

  return (
    <>
      {people.length === 0 ? (
        <Empty
          page={page}
          username={username}
          show={direction}
          title={
            direction === "following"
              ? `${name} isn't following anyone yet.`
              : `Nobody follows ${name} yet.`
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((person) => (
            <PersonRow
              key={person.id}
              profile={person}
              signedIn
              isSelf={viewerId === person.id}
              isFollowing={following.has(person.id)}
            />
          ))}
        </ul>
      )}
      <Pager
        page={page}
        hasMore={found.length > PAGE_SIZE}
        path={`/u/${username}/follows`}
        query={{ show: direction }}
      />
    </>
  );
}

async function Artists({ profileId, username, name, page }: Shown) {
  const found = await listFollowedArtists(profileId, {
    offset: (page - 1) * PAGE_SIZE,
    size: PAGE_SIZE + 1,
  });
  const artists = found.slice(0, PAGE_SIZE);

  return (
    <>
      {artists.length === 0 ? (
        <Empty
          page={page}
          username={username}
          show="artists"
          title={`${name} isn't following any artists yet.`}
        />
      ) : (
        <ul className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-5">
          {artists.map((artist, i) => (
            <li key={artist.mbid}>
              <ArtistCard
                mbid={artist.mbid}
                name={artist.name}
                imageUrl={artist.image_url}
                eager={i < 10}
              />
            </li>
          ))}
        </ul>
      )}
      <Pager
        page={page}
        hasMore={found.length > PAGE_SIZE}
        path={`/u/${username}/follows`}
        query={{ show: "artists" }}
      />
    </>
  );
}

/**
 * Who follows somebody, who they follow, and the artists they follow, as one
 * page with three tabs. A count on a profile is a dead end; this is the page
 * it leads to.
 */
export default async function FollowsPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ show?: string; page?: string }>;
}) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const { show } = query;
  const direction = directionOf(show);
  const page = pageNumber(query.page);

  // Who follows whom is for people with an account, like the People page.
  const viewer = await requireUser(
    withQuery(`/u/${encodeURIComponent(username)}/follows`, {
      show,
      page: page > 1 ? String(page) : undefined,
    }),
  );

  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const name = profile.display_name || profile.username;
  const shown: Shown = { profileId: profile.id, username: profile.username, name, page };
  const heading =
    direction === "following"
      ? `Who ${name} follows`
      : direction === "artists"
        ? `Artists ${name} follows`
        : "Followers";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <Link
        href={`/u/${profile.username}`}
        className="text-sm text-text-muted transition-colors hover:text-text"
      >
        &lsaquo; {name}
      </Link>

      <h1 className="display mt-3 text-3xl text-text sm:text-4xl">{heading}</h1>

      <nav className="mt-5 flex gap-2" aria-label="Which list">
        {TABS.map(([tab, label]) => (
          <Link
            key={tab}
            href={`/u/${profile.username}/follows?show=${tab}`}
            aria-current={direction === tab ? "page" : undefined}
            className={`${TAB} ${direction === tab ? ON : OFF}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-7">
        {direction === "artists" ? (
          <Artists {...shown} />
        ) : (
          <People {...shown} direction={direction} viewerId={viewer.id} />
        )}
      </div>
    </main>
  );
}
