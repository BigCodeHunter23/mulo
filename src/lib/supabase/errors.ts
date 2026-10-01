type QueryError = { code?: string; message: string };

/** PostgREST's code, and Postgres's, for a database function that doesn't exist. */
export function isMissingFunction(error: QueryError | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * Logs a failed read for Vercel's function logs, in the `[area] …` shape the
 * rest of the app uses. When the read was a database function that isn't
 * there, it names the migration to run instead, since that's the fix.
 */
export function logQueryError(area: string, error: QueryError, migration?: string): void {
  if (migration && isMissingFunction(error)) {
    console.error(`[${area}] database function not found; run migration ${migration}.`);
    return;
  }
  console.error(`[${area}] query failed:`, error.code ?? "", error.message);
}
