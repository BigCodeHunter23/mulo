import "server-only";
import { unstable_cache } from "next/cache";
import { asSignedOut } from "@/lib/supabase/signed-out-reads";

/** Carries an answer past the cache, which keeps whatever a read returns. */
class NotKept extends Error {
  constructor(readonly value: unknown) {
    super("Not kept");
  }
}

/**
 * A read kept and shared for `seconds`, the same for everybody, so it runs as
 * nobody and may read only what's public.
 *
 * An answer of nothing isn't kept, so whoever asks next can go and fetch it. Nor
 * is one read while the database was in trouble, which is likely to be wrong.
 * When that happens refreshing an entry past its time, Next logs "Not kept" and
 * carries on showing the old copy, which is the better of the two.
 */
export function keptRead<A extends unknown[], R>(
  name: string,
  seconds: number,
  read: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const kept = unstable_cache(
    async (...args: A) => {
      const { value, failed } = await asSignedOut(() => read(...args));
      if (failed || value === null) throw new NotKept(value);
      return value;
    },
    [name],
    { revalidate: seconds },
  );

  return async (...args) => {
    try {
      return await kept(...args);
    } catch (error) {
      if (error instanceof NotKept) return error.value as R;
      throw error;
    }
  };
}

/**
 * A read that depends on who's asking: signed-out visitors all get the same
 * answer, so it's kept and shared. Somebody signed in always reads afresh, as
 * themselves, and never sees or adds to what's kept.
 */
export function sharedWhenSignedOut<A extends unknown[], R>(
  name: string,
  seconds: number,
  read: (...args: A) => Promise<R>,
): (signedIn: boolean, ...args: A) => Promise<R> {
  const kept = keptRead(name, seconds, read);
  return (signedIn, ...args) => (signedIn ? read(...args) : kept(...args));
}
