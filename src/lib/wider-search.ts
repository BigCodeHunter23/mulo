import type { MbArtist, MbReleaseGroup } from "@/lib/musicbrainz";
import type { WiderAlbum, WiderArtist } from "@/app/search/WiderResults";

/** MusicBrainz's search answers trimmed to what the results list shows. */
export function widerResults(
  artists: MbArtist[],
  albums: MbReleaseGroup[],
  failed: boolean,
): { artists: WiderArtist[]; albums: WiderAlbum[]; failed: boolean } {
  return {
    artists: artists.slice(0, 8).map((artist) => ({
      id: artist.id,
      name: artist.name,
      disambiguation: artist.disambiguation || null,
    })),
    albums: albums.slice(0, 12).map((album) => ({
      id: album.id,
      title: album.title,
      artist: album["artist-credit"]?.[0]?.artist.name ?? null,
      year: album["first-release-date"]?.slice(0, 4) || null,
    })),
    failed,
  };
}
