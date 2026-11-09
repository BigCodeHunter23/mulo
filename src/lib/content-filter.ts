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

/**
 * The letters as somebody reads them, for matching only; what's saved stays as
 * typed. Decomposed so marks come off the letters, then rid of marks and of
 * every character that shows as nothing and would otherwise split a word: format
 * characters, the rest of Unicode's ignorables, and the braille blank.
 */
function asRead(text: string): string {
  return text.normalize("NFKD").replace(/[\p{Cf}\p{Mn}\p{DI}⠀]/gu, "");
}

/** No swearing or slurs. */
export function isClean(text: string): boolean {
  return !everything.hasMatch(asRead(text));
}

/** No slurs or hate words; everyday swearing is fine. */
export function isRespectful(text: string): boolean {
  return !hateful.hasMatch(asRead(text));
}
