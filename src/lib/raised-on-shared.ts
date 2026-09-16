import { ERAS } from "@/lib/eras";

/** The decade and scene behind saved ids, when they still exist in the lineup. */
export function findScene(eraId: string | null, sceneId: string | null) {
  const era = ERAS.find((candidate) => candidate.id === eraId) ?? null;
  const scene = era?.scenes.find((candidate) => candidate.id === sceneId) ?? null;
  return { era, scene };
}

/** The Raised On decade a year falls in, such as 1994 to "90s". */
export function eraForYear(year: number | null | undefined) {
  if (!year) return null;
  const id = `${String((Math.floor(year / 10) * 10) % 100).padStart(2, "0")}s`;
  return ERAS.some((era) => era.id === id) ? id : null;
}

/** "60s" stays short; the 2000s onwards need their century to read right. */
export function shortEraLabel(id: string) {
  return /^[0-2]0s$/.test(id) ? `20${id}` : id;
}
