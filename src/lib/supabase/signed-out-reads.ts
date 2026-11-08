import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A read whose answer is shared between visitors, so it must not depend on who
 * is asking. Inside one, the Supabase clients in `server.ts` act as nobody: no
 * cookies, no session, no signed-in user. Next also refuses cookies and headers
 * inside a kept read, so this is what lets the same lib functions run there.
 *
 * It also notes any trouble reaching the database. The lib functions turn a
 * failed query into an empty answer, which is right for one page but wrong to
 * keep: an hour of blank scores for everyone, from one bad moment.
 */
type Scope = { failed: boolean };

const scope = new AsyncLocalStorage<Scope>();

export function inSignedOutRead(): boolean {
  return scope.getStore() !== undefined;
}

export async function asSignedOut<T>(
  read: () => Promise<T>,
): Promise<{ value: T; failed: boolean }> {
  const current: Scope = { failed: false };
  const value = await scope.run(current, read);
  return { value, failed: current.failed };
}

/**
 * 402 and 429 are the database refusing, and 5xx is it failing. Other 4xxs are
 * left alone: a column a migration hasn't added yet is a 400, the lib functions
 * work round those, and that answer is good to keep.
 */
const isTrouble = (status: number) => status >= 500 || status === 402 || status === 429;

/** `fetch` for the public Supabase client, noting trouble if a kept read is running. */
export const watchedFetch: typeof fetch = async (input, init) => {
  const current = scope.getStore();
  try {
    const response = await fetch(input, init);
    if (current && isTrouble(response.status)) current.failed = true;
    return response;
  } catch (error) {
    if (current) current.failed = true;
    throw error;
  }
};
