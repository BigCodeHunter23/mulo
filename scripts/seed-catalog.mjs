#!/usr/bin/env node
/**
 * Pre-loads MULO's catalogue with the most-listened-to studio albums: their
 * artists (photo, biography, complete album list), genres, and the tracklist
 * of each album's standard edition, so the records people are most likely to
 * look up open instantly and every song can be rated.
 *
 * Popularity comes from ListenBrainz, MusicBrainz's sister project. Metadata
 * comes from MusicBrainz at its limit of about one request a second, so a big
 * run takes a while. It is safe to stop and run again: anything already
 * prepared is skipped and only its listen count is refreshed.
 *
 *   node --env-file=.env.local scripts/seed-catalog.mjs --albums=1000
 */
import { createClient } from "@supabase/supabase-js";

const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);
const ALBUM_LIMIT = Number(options.albums ?? 1000);

const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";
const HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) =>
  console.log(new Date().toISOString().slice(11, 19), ...parts);

// MusicBrainz allows about one request a second and answers 503 when busy.
let lastRequest = 0;
async function musicbrainz(path) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const wait = lastRequest + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();

    let response;
    try {
      response = await fetch(`https://musicbrainz.org/ws/2${path}`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      await sleep(attempt * 2000);
      continue;
    }

    if (response.status === 503 || response.status === 429) {
      await sleep(attempt * 3000);
      continue;
    }
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error(`MusicBrainz answered ${response.status}`);
    return response.json();
  }
  throw new Error("MusicBrainz stayed busy");
}

async function getJson(url) {
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(20000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const coverArtUrl = (id) =>
  `https://coverartarchive.org/release-group/${id}/front-500`;

const isStudioAlbum = (group) =>
  group["primary-type"] === "Album" &&
  (group["secondary-types"] ?? []).length === 0;

/** The artist credit as printed on the release, e.g. "JAY-Z & Kanye West". */
const creditText = (credit = []) =>
  credit.map((c) => `${c.name}${c.joinphrase ?? ""}`).join("").trim() || null;

/** Listen counts from ListenBrainz, most-played first. */
async function listenCounts(kind, wanted) {
  const endpoint = kind === "artists" ? "artists" : "release-groups";
  const listKey = kind === "artists" ? "artists" : "release_groups";
  const idKey = kind === "artists" ? "artist_mbid" : "release_group_mbid";
  const counts = new Map();

  for (let offset = 0; counts.size < wanted && offset < 20000; offset += 1000) {
    const data = await getJson(
      `https://api.listenbrainz.org/1/stats/sitewide/${endpoint}?count=1000&offset=${offset}&range=all_time`,
    );
    const rows = data?.payload?.[listKey] ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (row[idKey] && !counts.has(row[idKey])) {
        counts.set(row[idKey], row.listen_count);
      }
    }
    await sleep(500);
  }
  return counts;
}

/** Photo and Wikipedia summary, reached through the artist's Wikidata link. */
async function wikidataExtras(qid) {
  const entity = await getJson(
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
  );
  const data = entity?.entities?.[qid];
  if (!data) return { imageUrl: null, bio: null };

  const file = data.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null;
  const imageUrl = file
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
        file.replace(/ /g, "_"),
      )}?width=600`
    : null;

  let bio = null;
  const title = data.sitelinks?.enwiki?.title;
  if (title) {
    const summary = await getJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    );
    bio = summary?.extract?.trim() || null;
  }

  return { imageUrl, bio };
}

async function seedArtist(mbid, popularity, albumListens) {
  const { data: existing } = await supabase
    .from("artists")
    .select("name, albums_cached_at")
    .eq("mbid", mbid)
    .maybeSingle();

  if (existing?.albums_cached_at) {
    if (popularity !== null) {
      await supabase.from("artists").update({ popularity }).eq("mbid", mbid);
    }
    return `${existing.name}: already prepared`;
  }

  const artist = await musicbrainz(`/artist/${mbid}?inc=url-rels+aliases&fmt=json`);
  if (!artist) return `${mbid}: not found in MusicBrainz`;

  const qid = artist.relations
    ?.find((r) => r.type === "wikidata")
    ?.url?.resource?.split("/")
    .pop();
  const extras =
    qid && /^Q\d+$/.test(qid)
      ? await wikidataExtras(qid)
      : { imageUrl: null, bio: null };

  // Name plus aliases, so "Kanye West" still finds the artist now called Ye.
  const searchNames = [
    ...new Set(
      [artist.name, ...(artist.aliases ?? []).map((a) => a.name)].filter(Boolean),
    ),
  ].join(" | ");

  const { error: artistError } = await supabase.from("artists").upsert({
    mbid: artist.id,
    name: artist.name,
    image_url: extras.imageUrl ?? "",
    bio: extras.bio || artist.disambiguation || null,
    search_names: searchNames,
    ...(popularity !== null ? { popularity } : {}),
  });
  if (artistError) throw new Error(artistError.message);

  const albums = [];
  for (let offset = 0; offset < 300; offset += 100) {
    const page = await musicbrainz(
      `/release-group?artist=${artist.id}&type=album&inc=artist-credits&limit=100&offset=${offset}&fmt=json`,
    );
    const groups = page?.["release-groups"] ?? [];
    albums.push(...groups.filter(isStudioAlbum));
    if (groups.length < 100 || offset + 100 >= (page?.["release-group-count"] ?? 0)) {
      break;
    }
  }

  if (albums.length > 0) {
    const { data: present } = await supabase
      .from("releases")
      .select("mbid")
      .in("mbid", albums.map((g) => g.id));
    const presentIds = new Set((present ?? []).map((r) => r.mbid));

    const fresh = albums
      .filter((g) => !presentIds.has(g.id))
      .map((g) => ({
        mbid: g.id,
        title: g.title,
        artist_mbid: artist.id,
        release_date: g["first-release-date"] || null,
        cover_art_url: coverArtUrl(g.id),
        artist_credit: creditText(g["artist-credit"]),
        popularity: albumListens.get(g.id) ?? null,
      }));

    if (fresh.length > 0) {
      const { error } = await supabase
        .from("releases")
        .upsert(fresh, { onConflict: "mbid", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }

    // Albums the app cached earlier: fill in what they lack, leaving covers
    // and any fetched details alone.
    for (const g of albums.filter((g) => presentIds.has(g.id))) {
      const listens = albumListens.get(g.id);
      await supabase
        .from("releases")
        .update({
          artist_credit: creditText(g["artist-credit"]),
          ...(listens !== undefined ? { popularity: listens } : {}),
        })
        .eq("mbid", g.id);
    }
  }

  // Only now is the album list complete, so only now record it as such.
  await supabase
    .from("artists")
    .update({ albums_cached_at: new Date().toISOString() })
    .eq("mbid", artist.id);

  return `${artist.name}: ${albums.length} albums${extras.imageUrl ? ", photo" : ""}${
    extras.bio ? ", bio" : ""
  }`;
}

const trackCount = (edition) =>
  (edition.media ?? []).reduce((sum, m) => sum + (m["track-count"] ?? 0), 0);

// Worldwide and big English-language releases carry the titles people know.
const PREFERRED_COUNTRIES = ["XW", "US", "GB", "XE", "CA", "AU"];

/**
 * An album comes in many editions: deluxe versions with bonus tracks, promo
 * samplers, pressings for different countries. The standard edition is the
 * one released most often, so take the most common official track count,
 * then the best-placed, earliest release with that count. The app makes the
 * same choice in src/lib/musicbrainz.ts.
 */
function standardEdition(editions) {
  const usable = editions.filter((e) => trackCount(e) > 0);
  const official = usable.filter((e) => e.status === "Official");
  const pool = official.length > 0 ? official : usable;

  const byCount = new Map();
  for (const edition of pool) {
    const count = trackCount(edition);
    byCount.set(count, [...(byCount.get(count) ?? []), edition]);
  }

  const date = (e) => e.date || "9999";
  const earliest = (group) => group.map(date).sort()[0];
  const groups = [...byCount.values()].sort(
    (a, b) => b.length - a.length || earliest(a).localeCompare(earliest(b)),
  );

  const place = (e) => {
    const index = PREFERRED_COUNTRIES.indexOf(e.country ?? "");
    return index === -1 ? PREFERRED_COUNTRIES.length : index;
  };

  return (
    (groups[0] ?? []).sort(
      (a, b) => place(a) - place(b) || date(a).localeCompare(date(b)),
    )[0] ?? null
  );
}

/** Replaces an album's tracklist with its standard edition's, songs and all. */
async function seedTracklist(releaseMbid) {
  const list = await musicbrainz(
    `/release?release-group=${releaseMbid}&inc=media&limit=100&fmt=json`,
  );
  const edition = standardEdition(list?.releases ?? []);
  if (!edition) return "no tracklist";

  const release = await musicbrainz(`/release/${edition.id}?inc=recordings&fmt=json`);
  const tracks = (release?.media ?? []).flatMap((m) => m.tracks ?? []);
  if (tracks.length === 0) return "no tracklist";

  // A song can appear twice on one album; save it once.
  const songs = new Map();
  for (const t of tracks) {
    if (t.recording) {
      songs.set(t.recording.id, {
        mbid: t.recording.id,
        title: t.recording.title,
        duration_ms: t.recording.length ?? null,
      });
    }
  }

  if (songs.size > 0) {
    const { error } = await supabase
      .from("songs")
      .upsert([...songs.values()], { onConflict: "mbid" });
    if (error) throw new Error(error.message);
  }

  // Ratings belong to songs, not to these rows, so replacing them is safe.
  const { error: clearError } = await supabase
    .from("tracks")
    .delete()
    .eq("release_mbid", releaseMbid);
  if (clearError) throw new Error(clearError.message);

  // Numbered straight through, so a double album doesn't repeat 1, 2, 3.
  const { error: trackError } = await supabase.from("tracks").insert(
    tracks.map((t, i) => ({
      release_mbid: releaseMbid,
      position: i + 1,
      title: t.title,
      duration_ms: t.length ?? null,
      song_mbid: t.recording?.id ?? null,
    })),
  );
  if (trackError) throw new Error(trackError.message);

  await supabase
    .from("releases")
    .update({ tracks_cached_at: new Date().toISOString() })
    .eq("mbid", releaseMbid);

  return `${tracks.length} songs from the ${edition.date ?? "undated"} ${
    edition.country ?? "worldwide"
  } edition`;
}

async function seedAlbumDetails(group, listens) {
  const { data: existing } = await supabase
    .from("releases")
    .select("mbid, details_cached_at, tracks_cached_at")
    .eq("mbid", group.id)
    .maybeSingle();

  if (existing?.details_cached_at) {
    if (listens !== null) {
      await supabase.from("releases").update({ popularity: listens }).eq("mbid", group.id);
    }
    if (existing.tracks_cached_at) return "already prepared";
    return await seedTracklist(group.id);
  }

  const full = await musicbrainz(
    `/release-group/${group.id}?inc=artist-credits+genres&fmt=json`,
  );
  if (!full) return "not found in MusicBrainz";

  const credit = full["artist-credit"]?.length
    ? full["artist-credit"]
    : (group["artist-credit"] ?? []);
  const primary = credit[0]?.artist;
  if (!primary) return "no artist credit";

  await supabase
    .from("artists")
    .upsert(
      { mbid: primary.id, name: primary.name },
      { onConflict: "mbid", ignoreDuplicates: true },
    );

  const row = {
    title: full.title,
    artist_mbid: primary.id,
    release_date: full["first-release-date"] || null,
    genres: (full.genres ?? []).map((g) => g.name),
    artist_credit: creditText(credit),
    ...(listens !== null ? { popularity: listens } : {}),
    details_cached_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from("releases").update(row).eq("mbid", full.id)
    : await supabase
        .from("releases")
        .upsert(
          { mbid: full.id, cover_art_url: coverArtUrl(full.id), ...row },
          { onConflict: "mbid" },
        );
  if (error) throw new Error(error.message);

  return `${row.genres.length} genres, ${await seedTracklist(full.id)}`;
}

/**
 * Tracklists for albums already in the catalogue that don't have one yet,
 * most-played first. Albums reached through an artist's page arrive with a
 * title and a cover but no songs, and a Stack card for one of those has no
 * hits to show. Safe to stop and rerun.
 *
 *   node --env-file=.env.local scripts/seed-catalog.mjs --tracklists
 */
async function fillTracklists() {
  let done = 0;
  let failed = 0;

  const mark = (mbid) =>
    supabase
      .from("releases")
      .update({ tracks_cached_at: new Date().toISOString() })
      .eq("mbid", mbid);

  for (;;) {
    // Every album gets marked as it's dealt with, even one with nothing to
    // show, so each batch is simply whatever is still unmarked.
    const { data, error } = await supabase
      .from("releases")
      .select("mbid, title")
      .is("tracks_cached_at", null)
      .order("popularity", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const release of data) {
      done++;
      try {
        const result = await seedTracklist(release.mbid);
        log(`Tracklist ${done} ${release.title}: ${result}`);
        if (!/songs from/.test(result)) await mark(release.mbid);
      } catch (problem) {
        failed++;
        log(`Tracklist ${done} ${release.title} failed: ${problem.message}`);
        await mark(release.mbid);
      }
    }
  }

  log(`Tracklists finished: ${done} albums, ${failed} failures.`);
}

/**
 * The main run picks albums by ListenBrainz plays, which leans hard towards
 * hip hop and rock: house, techno, country, reggae and the rest barely make
 * it in, so their artists' "more like" rows have nobody to suggest. This
 * fills each genre on its own terms: the most-played artists whose main tags
 * include it, their full album lists, and details and songs for their three
 * biggest albums. Safe to stop and rerun.
 *
 *   node --env-file=.env.local scripts/seed-catalog.mjs --genres
 *   node --env-file=.env.local scripts/seed-catalog.mjs --genres=house,techno --per-genre=40
 */
const GENRES = [
  "house", "deep house", "tech house", "progressive house", "techno",
  "melodic techno", "trance", "drum and bass", "dubstep", "uk garage",
  "electro house", "edm", "ambient", "downtempo", "disco", "nu disco",
  "synthwave", "country", "reggae", "dancehall", "afrobeats", "latin",
  "reggaeton", "k-pop", "jazz", "soul", "neo soul", "blues", "folk",
  "classical", "indie rock", "psychedelic rock", "metal",
];

const VARIOUS_ARTISTS = "89ad4ac3-39f7-470e-963a-56509c546377";

/** ListenBrainz play counts for artists or albums, by MusicBrainz id. */
async function popularity(kind, ids) {
  const counts = new Map();
  const [path, key, idKey] =
    kind === "artists"
      ? ["artist", "artist_mbids", "artist_mbid"]
      : ["release-group", "release_group_mbids", "release_group_mbid"];
  for (let i = 0; i < ids.length; i += 500) {
    try {
      const response = await fetch(`https://api.listenbrainz.org/1/popularity/${path}`, {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: ids.slice(i, i + 500) }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) continue;
      for (const row of await response.json()) {
        if (row.total_listen_count) counts.set(row[idKey], row.total_listen_count);
      }
    } catch {
      // Carry on with what came back.
    }
    await sleep(500);
  }
  return counts;
}

/**
 * Artists MusicBrainz tags with a genre. Its search is loose (Prince turns up
 * under house), so keep only artists for whom the genre is one of their main
 * tags: at least half as many votes as their most-voted one.
 */
async function artistsTagged(genre) {
  const found = new Set();
  for (let offset = 0; offset < 300; offset += 100) {
    const data = await musicbrainz(
      `/artist?query=${encodeURIComponent(`tag:"${genre}"`)}&limit=100&offset=${offset}&fmt=json`,
    );
    const artists = data?.artists ?? [];
    for (const artist of artists) {
      if (artist.id === VARIOUS_ARTISTS) continue;
      const tags = artist.tags ?? [];
      const top = Math.max(0, ...tags.map((t) => t.count ?? 0));
      const tag = tags.find((t) => t.name === genre);
      if (tag && top > 0 && (tag.count ?? 0) * 2 >= top) found.add(artist.id);
    }
    if (artists.length < 100) break;
  }
  return [...found];
}

/** An artist, their album list, and details and songs for their three biggest albums. */
async function prepareArtist(id, listens, label) {
  log(`  ${label}: ${await seedArtist(id, listens, new Map())}`);

  const { data: albums } = await supabase
    .from("releases")
    .select("mbid, title, popularity")
    .eq("artist_mbid", id);
  const albumPlays = await popularity("albums", (albums ?? []).map((a) => a.mbid));
  for (const album of albums ?? []) {
    const count = albumPlays.get(album.mbid);
    if (count && count !== album.popularity) {
      await supabase.from("releases").update({ popularity: count }).eq("mbid", album.mbid);
    }
  }

  // With no play counts at all, any three albums beat none.
  const biggest = [...(albums ?? [])]
    .sort((a, b) => (albumPlays.get(b.mbid) ?? 0) - (albumPlays.get(a.mbid) ?? 0))
    .slice(0, 3);
  for (const album of biggest) {
    const result = await seedAlbumDetails({ id: album.mbid }, albumPlays.get(album.mbid) ?? null);
    log(`    ${album.title}: ${result}`);
  }
}

/**
 * Artists MusicBrainz hasn't tagged with any genre, which no genre run can
 * find (Ben Böhmer, for one), by MusicBrainz id.
 *
 *   node --env-file=.env.local scripts/seed-catalog.mjs --artists=e4f12dfc-1ee7-4250-8e24-549b6d46676d
 */
async function fillArtists() {
  const ids = options.artists.split(",").map((id) => id.trim());
  const plays = await popularity("artists", ids);
  for (const id of ids) {
    try {
      await prepareArtist(id, plays.get(id) ?? null, "artist");
    } catch (problem) {
      log(`  ${id} failed: ${problem.message}`);
    }
  }
}

async function fillGenres() {
  const genres =
    options.genres === "true" ? GENRES : options.genres.split(",").map((g) => g.trim());
  const perGenre = Number(options["per-genre"] ?? 25);
  let failed = 0;

  for (const genre of genres) {
    const candidates = await artistsTagged(genre);
    const plays = await popularity("artists", candidates);
    const chosen = [...plays.entries()].sort((a, b) => b[1] - a[1]).slice(0, perGenre);
    log(`${genre}: ${candidates.length} artists tagged, preparing the top ${chosen.length}`);

    for (const [id, listens] of chosen) {
      try {
        await prepareArtist(id, listens, genre);
      } catch (problem) {
        failed++;
        log(`  ${genre}: ${id} failed: ${problem.message}`);
      }
    }
  }

  log(`Genres finished with ${failed} failures.${failed ? " Run again to retry them." : ""}`);
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Run with: node --env-file=.env.local scripts/seed-catalog.mjs");
  }

  if (options.tracklists) return fillTracklists();
  if (options.genres) return fillGenres();
  if (options.artists) return fillArtists();

  log(`Preparing up to ${ALBUM_LIMIT} of the most-listened-to studio albums`);

  const albumListens = await listenCounts("release-groups", Math.ceil(ALBUM_LIMIT * 1.6));
  const artistListens = await listenCounts("artists", 3000);
  log(
    `ListenBrainz: ${albumListens.size} popular release groups, ${artistListens.size} popular artists`,
  );

  // Keep only studio albums, asking MusicBrainz about 100 at a time.
  const ids = [...albumListens.keys()];
  const albums = [];
  for (let i = 0; i < ids.length && albums.length < ALBUM_LIMIT; i += 100) {
    const query = `rgid:(${ids.slice(i, i + 100).join(" OR ")})`;
    const data = await musicbrainz(
      `/release-group?query=${encodeURIComponent(query)}&limit=100&fmt=json`,
    );
    albums.push(...(data?.["release-groups"] ?? []).filter(isStudioAlbum));
    log(`Checked ${Math.min(i + 100, ids.length)} release groups: ${albums.length} studio albums`);
  }
  albums.sort((a, b) => (albumListens.get(b.id) ?? 0) - (albumListens.get(a.id) ?? 0));
  albums.splice(ALBUM_LIMIT);

  // An artist's popularity is their own listen count, or failing that the
  // count for their most-played album (the first one met in this order).
  const artists = new Map();
  for (const album of albums) {
    const id = album["artist-credit"]?.[0]?.artist?.id;
    if (id && !artists.has(id)) {
      artists.set(id, artistListens.get(id) ?? albumListens.get(album.id) ?? null);
    }
  }

  let failed = 0;

  // Artists first, so their pages show a complete album list from the start.
  log(`Preparing ${artists.size} artists`);
  let n = 0;
  for (const [id, listens] of artists) {
    n++;
    try {
      log(`Artist ${n}/${artists.size} ${await seedArtist(id, listens, albumListens)}`);
    } catch (error) {
      failed++;
      log(`Artist ${n}/${artists.size} ${id} failed: ${error.message}`);
    }
  }

  log(`Preparing ${albums.length} albums`);
  n = 0;
  for (const album of albums) {
    n++;
    try {
      const result = await seedAlbumDetails(album, albumListens.get(album.id) ?? null);
      log(`Album ${n}/${albums.length} ${album.title}: ${result}`);
    } catch (error) {
      failed++;
      log(`Album ${n}/${albums.length} ${album.title} failed: ${error.message}`);
    }
  }

  log(`Finished with ${failed} failures.${failed ? " Run again to retry them." : ""}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
