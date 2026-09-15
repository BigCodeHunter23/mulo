import { mostPlayedAlbums, popularArtists, topRatedOnMulo } from "@/lib/discover";
import { getGlobalFeed } from "@/lib/feed";
import AlbumCard from "@/components/AlbumCard";
import ArtistCard from "@/components/ArtistCard";
import FeedItem from "@/components/FeedItem";
import { SectionHeading } from "@/components/ui";

const ALBUM_GRID =
  "grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5";

/** The browsable parts of MULO, shared by the Discover page and the home page. */
export default async function DiscoverSections() {
  const [topRated, mostPlayed, artists, recent] = await Promise.all([
    topRatedOnMulo(10),
    mostPlayedAlbums(15),
    popularArtists(10),
    getGlobalFeed(6),
  ]);

  return (
    <div className="flex flex-col gap-14">
      {/* Only worth showing once enough albums have been rated to rank. */}
      {topRated.length >= 4 && (
        <section>
          <SectionHeading>Top rated on MULO</SectionHeading>
          <ul className={ALBUM_GRID}>
            {topRated.map((album, i) => (
              <li key={album.mbid}>
                <AlbumCard
                  mbid={album.mbid}
                  title={album.title}
                  artist={album.artist}
                  coverUrl={album.cover_art_url}
                  score={album.average}
                  eager={i < 5}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {mostPlayed.length > 0 && (
        <section>
          <SectionHeading
            action={
              <span className="text-xs text-text-muted">
                By listens on ListenBrainz
              </span>
            }
          >
            Most-played albums
          </SectionHeading>
          <ul className={ALBUM_GRID}>
            {mostPlayed.map((album, i) => (
              <li key={album.mbid}>
                <AlbumCard
                  mbid={album.mbid}
                  title={album.title}
                  artist={album.artist}
                  year={album.year}
                  coverUrl={album.cover_art_url}
                  eager={i < 5}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {artists.length > 0 && (
        <section>
          <SectionHeading>Artists to explore</SectionHeading>
          <ul className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-5">
            {artists.map((artist) => (
              <li key={artist.mbid}>
                <ArtistCard
                  mbid={artist.mbid}
                  name={artist.name}
                  imageUrl={artist.image_url}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <SectionHeading>Just rated</SectionHeading>
          <ul className="grid gap-3 md:grid-cols-2">
            {recent.map((item) => (
              <FeedItem key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
