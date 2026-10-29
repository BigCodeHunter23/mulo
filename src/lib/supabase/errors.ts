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

/**
 * PostgREST's code, and Postgres's, for a table that doesn't exist: a
 * migration that hasn't run yet.
 */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/**
 * Postgres's code, and PostgREST's, for a column that doesn't exist: a
 * migration that adds one hasn't run yet.
 */
export function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}
