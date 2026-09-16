import "server-only";
import type { Era, Scene } from "@/lib/eras";
import { findScene } from "@/lib/raised-on-shared";
import { createClient } from "@/lib/supabase/server";

export type RaisedOn = {
  era: Era | null;
  scene: Scene | null;
  album: {
    mbid: string;
    title: string;
    artist: string | null;
    cover: string | null;
    year: number | null;
  };
};

type Row = {
  raised_era: string | null;
  raised_scene: string | null;
  releases: {
    mbid: string;
    title: string;
    artist_credit: string | null;
    cover_art_url: string | null;
    release_date: string | null;
  } | null;
};

/** The record somebody was raised on, with its decade and scene, if they've picked. */
export async function getRaisedOn(userId: string): Promise<RaisedOn | null> {
  const supabase = await createClient();

  // Named, because ratings and GOAT lists also connect profiles to albums.
  const { data } = await supabase
    .from("profiles")
    .select(
      "raised_era, raised_scene, releases!profiles_raised_on_mbid_fkey ( mbid, title, artist_credit, cover_art_url, release_date )",
    )
    .eq("id", userId)
    .maybeSingle();

  const row = data as unknown as Row | null;
  if (!row?.releases) return null;

  const { era, scene } = findScene(row.raised_era, row.raised_scene);
  const album = row.releases;

  return {
    era,
    scene,
    album: {
      mbid: album.mbid,
      title: album.title,
      artist: album.artist_credit,
      cover: album.cover_art_url || null,
      year: album.release_date ? Number(album.release_date.slice(0, 4)) : null,
    },
  };
}
