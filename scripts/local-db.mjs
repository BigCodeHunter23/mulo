// An in-memory Postgres (PGlite) with MULO's migrations applied, for tests and
// for generating database types. Nothing here touches a real Supabase project.
//
// Supabase provides some things every migration assumes: the anon,
// authenticated and service_role roles, an `auth` schema with `auth.users`
// and `auth.uid()`, an `extensions` schema, and default grants on new tables.
// A small stand-in for each is created first.

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));

const SUPABASE_STAND_IN = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema extensions;
  create table auth.users (id uuid primary key, email text);
  -- Supabase reads the signed-in user from the request's JWT; tests set it
  -- with set_config('request.jwt.claim.sub', <id>, true).
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

/** Migration file names, in the order they run. */
export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/** One migration's SQL. */
export function migrationSql(name) {
  return readFileSync(join(MIGRATIONS_DIR, name), "utf8");
}

/**
 * A fresh database with the Supabase stand-ins and, by default, every
 * migration applied. `before` stops short of the named migration (for
 * example "0016") so a test can seed old data first.
 *
 * @param {{ before?: string }} [options]
 */
export async function localDatabase(options = {}) {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STAND_IN);
  for (const name of migrationFiles()) {
    if (options.before && name >= options.before) break;
    await db.exec(migrationSql(name));
  }
  return db;
}
