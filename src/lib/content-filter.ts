import { DataSet, englishDataset, englishRecommendedTransformers, RegExpMatcher } from "obscenity";

/**
 * The word filter for what people write. Names and titles are public
 * identity, so they're held to "clean"; reviews and takes are about music,
 * where people swear, so they're only held to "respectful": no slurs or hate.
 * Apple's review asks for abusive content to be filtered; reports, blocks
 * and the moderation inbox do the rest. Pure, so the website's forms and the
 * app API share it through the actions.
 */

export const NOT_CLEAN = "Please choose something else.";
export const NOT_RESPECTFUL = "Please keep it respectful.";

/**
 * Slurs and hate words in obscenity's English data set, by its `originalWord`.
 * "negro" and "dyke" are left out on purpose (album titles, reclaimed use); names still block them.
 */
const HATEFUL = new Set([
  "nigger",
  "fag",
  "retard",
  "chink",
  "kike",
  "tranny",
  "abeed",
  "africoon",
  "arabush",
  "boonga",
  "chingchong",
  "abo",
  "spastic",
]);

const everything = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const hateful = new RegExpMatcher({
  ...new DataSet<{ originalWord: string }>()
    .addAll(englishDataset)
    .removePhrasesIf((phrase) => !HATEFUL.has(phrase.metadata?.originalWord ?? ""))
    .build(),
  ...englishRecommendedTransformers,
});

/** No swearing or slurs. */
export function isClean(text: string): boolean {
  return !everything.hasMatch(text);
}

/** No slurs or hate words; everyday swearing is fine. */
export function isRespectful(text: string): boolean {
  return !hateful.hasMatch(text);
}
