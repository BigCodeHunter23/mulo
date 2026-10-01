/** Runs once as each server instance starts, before it takes requests. */
export async function register() {
  const { checkEnv } = await import("@/lib/env");
  checkEnv();
}
