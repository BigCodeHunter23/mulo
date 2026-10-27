import "server-only";
import type { PublicProfile } from "@/lib/app-api";
import { isHidden } from "@/lib/blocks";
import { getProfileByUsername } from "@/lib/social";
import { rowIdText, usernameSchema } from "@/lib/validation";

export const PERSON_NOT_FOUND = "We couldn't find that person.";
export const LIST_NOT_FOUND = "We couldn't find that list.";
export const PICK_A_USERNAME = "Pick a username first.";

/**
 * Somebody the caller may see, by username: null for a name that can't
 * exist, nobody by that name, or somebody blocked either way round, so each
 * app endpoint answers all three with the same 404.
 */
export async function visibleProfile(username: string): Promise<PublicProfile | null> {
  if (!usernameSchema.safeParse(username).success) return null;
  const profile = await getProfileByUsername(username);
  if (!profile || (await isHidden(profile.id))) return null;
  return profile;
}

/** A list id from an address, or null for one that can't exist. */
export function listId(text: string): number | null {
  const parsed = rowIdText.safeParse(text);
  return parsed.success ? parsed.data : null;
}
