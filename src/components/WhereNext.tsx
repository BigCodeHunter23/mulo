import { similarArtists } from "@/lib/discover";
import ArtistCard from "@/components/ArtistCard";
import { ARTIST_GRID, ARTIST_ITEM, SectionHeading } from "@/components/ui";

/** Below this it looks like an accident rather than a suggestion. */
const MINIMUM = 3;

/**
 * The bottom of an artist or album page used to be a dead end. This offers
 * somewhere to go next: artists whose records share the same genres, closest
 * first. Nothing shows when the catalogue has nothing close enough.
 */
export default async function WhereNext({
  mbid,
  name,
}: {
  /** The artist to find neighbours for. */
  mbid: string;
  name: string;
}) {
  const artists = await similarArtists(mbid, 6);
  if (artists.length < MINIMUM) return null;

  return (
    <section className="mt-16">
      <SectionHeading
        action={<span className="text-xs text-text-muted">Keep going</span>}
      >
        More like {name}
      </SectionHeading>
      <ul className={ARTIST_GRID}>
        {artists.map((artist) => (
          <li key={artist.mbid} className={ARTIST_ITEM}>
            <ArtistCard mbid={artist.mbid} name={artist.name} imageUrl={artist.image_url} />
          </li>
        ))}
      </ul>
    </section>
  );
}
