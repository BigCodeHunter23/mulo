/**
 * The whole of MusicBrainz, exactly as the website's search box asks it. The
 * answer is the same for everybody, so the website's handler, with its
 * caching and its limit, serves the app too.
 */
export { GET } from "@/app/api/search/wider/route";
