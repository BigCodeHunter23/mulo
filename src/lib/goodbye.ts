/**
 * The goodbye on the home page after deleting an account: `/?goodbye=1`, or
 * `/?goodbye=apple` when Apple couldn't be told and the person should remove
 * the Sign in with Apple link themselves. Anything else in the address shows
 * nothing.
 */
export function goodbyeKind(value: string | string[] | undefined): "plain" | "apple" | null {
  if (value === "1") return "plain";
  if (value === "apple") return "apple";
  return null;
}
