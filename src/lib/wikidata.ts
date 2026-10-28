import "server-only";

// Wikimedia asks requests to identify the app; the site address is the contact.
const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";

export type ArtistExtras = {
  /** Commons image URL, or null when the artist has no photo available. */
  imageUrl: string | null;
  /** First paragraph of the Wikipedia article, or null. */
  bio: string | null;
  /** That article's address, to credit it, or null without a bio. */
  bioUrl: string | null;
  /**
   * False when Wikidata or Wikipedia didn't answer, so what's missing may
   * only be missing for now and is worth asking for again.
   */
  answered: boolean;
};

/** A request that got no answer, as opposed to one that found nothing (null). */
const NO_ANSWER = Symbol("no answer");

async function getJson<T>(url: string): Promise<T | null | typeof NO_ANSWER> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) return NO_ANSWER;
    return (await response.json()) as T;
  } catch {
    // These are enrichment extras: if they fail, the page still works.
    return NO_ANSWER;
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
export async function getArtistExtras(wikidataQid: string): Promise<ArtistExtras> {
  const entity = await getJson<{ entities: Record<string, WikidataEntity> }>(
    `https://www.wikidata.org/wiki/Special:EntityData/${wikidataQid}.json`,
  );

  if (entity === NO_ANSWER) return { imageUrl: null, bio: null, bioUrl: null, answered: false };
  const data = entity?.entities?.[wikidataQid];
  if (!data) return { imageUrl: null, bio: null, bioUrl: null, answered: true };

  const imageFile = data.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null;
  const imageUrl = imageFile
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
        imageFile.replace(/ /g, "_"),
      )}?width=600`
    : null;

  const title = data.sitelinks?.enwiki?.title;
  let bio: string | null = null;
  let answered = true;

  if (title) {
    const summary = await getJson<{ extract?: string }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    );
    if (summary === NO_ANSWER) answered = false;
    else bio = summary?.extract?.trim() || null;
  }

  const bioUrl =
    bio && title
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
      : null;

  return { imageUrl, bio, bioUrl, answered };
}
