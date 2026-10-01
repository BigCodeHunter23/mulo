import { z } from "zod";

/**
 * The environment variables MULO runs on, checked in one place.
 *
 * Each one is read when it's first needed, so a build or a test that never
 * touches Supabase doesn't need them. `checkEnv()` runs once when the server
 * starts (see `src/instrumentation.ts`) and logs every problem at once, so a
 * missing or mistyped setting in Vercel shows up plainly instead of as a
 * confusing failure deep inside a query.
 *
 * No `server-only` here on purpose: the proxy reads the Supabase address and
 * key too, and it isn't bundled as a server component. The service role key
 * is never inlined into the browser bundle either way, because only
 * `NEXT_PUBLIC_*` variables are.
 */

const schema = {
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
} as const;

type Name = keyof typeof schema;

const WHERE =
  "Set it in .env.local when running locally, or in Vercel under Settings → Environment Variables.";

function problem(name: Name): string | null {
  const value = process.env[name];
  if (!value) return `${name} is missing. ${WHERE}`;
  return schema[name].safeParse(value).success ? null : `${name} isn't valid. ${WHERE}`;
}

function read(name: Name): string {
  const issue = problem(name);
  if (issue) throw new Error(issue);
  return process.env[name]!;
}

/** The Supabase project's address. */
export const supabaseUrl = () => read("NEXT_PUBLIC_SUPABASE_URL");
/** The public (anon) key: safe in a browser, and limited by row-level security. */
export const supabaseAnonKey = () => read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
/** The service role key, which bypasses row-level security. Server only. */
export const serviceRoleKey = () => read("SUPABASE_SERVICE_ROLE_KEY");

/** Every problem with the environment, or none. */
export function envProblems(): string[] {
  return (Object.keys(schema) as Name[]).flatMap((name) => problem(name) ?? []);
}

/** Logs every problem with the environment at once. */
export function checkEnv(): void {
  for (const issue of envProblems()) console.error(`[env] ${issue}`);
}
