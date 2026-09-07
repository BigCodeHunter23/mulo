import "server-only";

const USER_AGENT = "MULO/0.1 (alexbacskos@gmail.com)";

export type ArtistExtras = {
  /** Commons image URL, or null when the artist has no photo available. */
  imageUrl: string | null;
  /** First paragraph of the Wikipedia article, or null. */
  bio: string | null;
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // These are enrichment extras: if they fail, the page still works.
    return null;
  }
}

type WikidataEntity = {
  claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] };
  sitelinks?: { enwiki?: { title?: string } };
};

/**
 * MusicBrainz holds no artist photos or prose biographies, but it does link
 * artists to Wikidata, which has both. Fetches the photo and the opening of
 * the Wikipedia article so artist pages aren't bare text.
 *
 * Every step is optional: plenty of artists have no Wikidata entry at all.
 */
export async function getArtistExtras(
  wikidataQid: string,
): Promise<ArtistExtras> {
  const entity = await getJson<{ entities: Record<string, WikidataEntity> }>(
    `https://www.wikidata.org/wiki/Special:EntityData/${wikidataQid}.json`,
  );

  const data = entity?.entities?.[wikidataQid];
  if (!data) return { imageUrl: null, bio: null };

  const imageFile = data.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null;
  const imageUrl = imageFile
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
        imageFile.replace(/ /g, "_"),
      )}?width=600`
    : null;

  const title = data.sitelinks?.enwiki?.title;
  let bio: string | null = null;

  if (title) {
    const summary = await getJson<{ extract?: string }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        title,
      )}`,
    );
    bio = summary?.extract?.trim() || null;
  }

  return { imageUrl, bio };
}
