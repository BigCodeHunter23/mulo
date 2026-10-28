import { afterEach, describe, expect, it, vi } from "vitest";
import { getArtistExtras } from "./wikidata";

const QID = "Q15862";
const entity = (enwiki?: string) => ({
  entities: { [QID]: { sitelinks: enwiki ? { enwiki: { title: enwiki } } : {} } },
});

/** Wikidata and Wikipedia, answering each address with the status and body given. */
function answer(byHost: Record<string, { status: number; body?: unknown }>) {
  vi.stubGlobal("fetch", async (url: string) => {
    const reply = byHost[new URL(url).hostname] ?? { status: 404 };
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("getArtistExtras", () => {
  it("gives the article's address with its opening paragraph", async () => {
    answer({
      "www.wikidata.org": { status: 200, body: entity("Queen (band)") },
      "en.wikipedia.org": { status: 200, body: { extract: "Queen are a British rock band." } },
    });
    expect(await getArtistExtras(QID)).toMatchObject({
      bio: "Queen are a British rock band.",
      bioUrl: "https://en.wikipedia.org/wiki/Queen_(band)",
      answered: true,
    });
  });

  it("finds nothing, for good, for an artist with no English article", async () => {
    answer({ "www.wikidata.org": { status: 200, body: entity() } });
    expect(await getArtistExtras(QID)).toMatchObject({ bio: null, bioUrl: null, answered: true });
  });

  it("says so when Wikipedia didn't answer, rather than that there's no article", async () => {
    answer({
      "www.wikidata.org": { status: 200, body: entity("Queen (band)") },
      "en.wikipedia.org": { status: 503 },
    });
    expect(await getArtistExtras(QID)).toMatchObject({ bio: null, bioUrl: null, answered: false });
  });

  it("says so when Wikidata didn't answer", async () => {
    answer({ "www.wikidata.org": { status: 429 } });
    expect((await getArtistExtras(QID)).answered).toBe(false);
  });
});
