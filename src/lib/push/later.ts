import "server-only";
import { after } from "next/server";

/**
 * Runs a task once the response has gone, so nobody waits on a push.
 * Outside a request (a test, a script) `after` throws, so it just runs. Any
 * other failure to schedule is logged and dropped: a push never breaks the
 * action that caused it.
 */
export function later(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch (error) {
    if (error instanceof Error && error.message.includes("outside a request scope")) {
      void task().catch(() => undefined);
    } else {
      console.error("[push] couldn't schedule:", error);
    }
  }
}
