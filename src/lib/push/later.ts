import "server-only";
import { after } from "next/server";

/**
 * Runs a task once the response has gone, so nobody waits on a push.
 * Outside a request (a test, a script) `after` throws, so it just runs.
 */
export function later(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task().catch(() => undefined);
  }
}
