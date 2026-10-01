// Writes src/lib/supabase/database.types.ts: TypeScript types for every table
// and function in the public schema, worked out from the migrations.
//
//   npm run db:types
//
// Supabase's own `supabase gen types` reads a live database (or a local one
// running in Docker). This reads the migrations instead, replayed on an
// in-memory Postgres, so it needs no access to the project and no Docker, and
// the output is in the same shape the Supabase client expects (except that
// function result columns are typed as possibly null; see functionBlock).
// Once the project's own generator is available the two should agree; if
// they don't, a migration hasn't been run.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { localDatabase } from "./local-db.mjs";

export const TYPES_FILE = fileURLToPath(
  new URL("../src/lib/supabase/database.types.ts", import.meta.url),
);

const SCALARS = {
  bool: "boolean",
  int2: "number",
  int4: "number",
  int8: "number",
  float4: "number",
  float8: "number",
  numeric: "number",
  text: "string",
  varchar: "string",
  bpchar: "string",
  uuid: "string",
  date: "string",
  time: "string",
  timetz: "string",
  timestamp: "string",
  timestamptz: "string",
  interval: "string",
  json: "Json",
  jsonb: "Json",
  void: "undefined",
  record: "Record<string, unknown>",
};

/** A Postgres type name (as pg_type.typname) in TypeScript. */
function tsType(typname) {
  if (typname.startsWith("_")) return `${tsType(typname.slice(1))}[]`;
  return SCALARS[typname] ?? "unknown";
}

const key = (name) => (/^[a-z_][a-z0-9_]*$/i.test(name) ? name : JSON.stringify(name));

async function tables(db) {
  const { rows } = await db.query(`
    select c.relname as table, a.attname as column, t.typname as type,
           not a.attnotnull as nullable,
           a.atthasdef as has_default,
           a.attidentity as identity,
           a.attgenerated as generated
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname, a.attname`);
  const byTable = new Map();
  for (const row of rows) {
    if (!byTable.has(row.table)) byTable.set(row.table, []);
    byTable.get(row.table).push(row);
  }
  return byTable;
}

async function relationships(db) {
  // Unique column sets per table, to tell one-to-one keys from many-to-one.
  const { rows: uniques } = await db.query(`
    select c.relname as table,
           array(select a.attname from unnest(i.indkey) k
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k
                 order by a.attname) as columns
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and i.indisunique and i.indpred is null`);
  const unique = new Set(uniques.map((u) => `${u.table}:${u.columns.join(",")}`));

  const { rows } = await db.query(`
    select con.conname as name, src.relname as table, dst.relname as referenced,
           array(select a.attname from unnest(con.conkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) as columns,
           array(select a.attname from unnest(con.confkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) as referenced_columns
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_namespace sn on sn.oid = src.relnamespace
    join pg_class dst on dst.oid = con.confrelid
    join pg_namespace dn on dn.oid = dst.relnamespace
    where con.contype = 'f' and sn.nspname = 'public' and dn.nspname = 'public'
    order by con.conname`);
  const byTable = new Map();
  for (const row of rows) {
    if (!byTable.has(row.table)) byTable.set(row.table, []);
    byTable.get(row.table).push({
      ...row,
      oneToOne: unique.has(`${row.table}:${[...row.columns].sort().join(",")}`),
    });
  }
  return byTable;
}

async function functions(db) {
  const { rows } = await db.query(`
    select p.proname as name, p.proretset as returns_set,
           rt.typname as return_type,
           p.proargnames as arg_names, p.proargmodes as arg_modes,
           array(select t.typname from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality a(oid, i)
                 join pg_type t on t.oid = a.oid order by a.i) as arg_types,
           p.pronargdefaults as defaults, p.pronargs as nargs
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type rt on rt.oid = p.prorettype
    where n.nspname = 'public' and p.prokind = 'f' and rt.typname <> 'trigger'
    order by p.proname`);
  return rows;
}

function columnsBlock(columns, mode, indent) {
  const pad = " ".repeat(indent);
  return columns
    .map((col) => {
      const base = tsType(col.type);
      const type = col.nullable ? `${base} | null` : base;
      const alwaysGenerated = col.identity === "a" || col.generated === "s";
      if (mode === "Row") return `${pad}${key(col.column)}: ${type}`;
      if (alwaysGenerated) return `${pad}${key(col.column)}?: never`;
      const optional =
        mode === "Update" || col.nullable || col.has_default || col.identity === "d";
      return `${pad}${key(col.column)}${optional ? "?" : ""}: ${type}`;
    })
    .join("\n");
}

function functionBlock(fn) {
  const modes = fn.arg_modes ?? fn.arg_types.map(() => "i");
  const names = fn.arg_names ?? [];
  const inputs = [];
  const outputs = [];
  fn.arg_types.forEach((type, i) => {
    const entry = { name: names[i], type };
    if (modes[i] === "t" || modes[i] === "o") outputs.push(entry);
    else inputs.push(entry);
  });
  const firstDefault = fn.nargs - fn.defaults;
  const args = inputs.length
    ? `{\n${inputs
        .map((arg, i) => `          ${key(arg.name)}${i >= firstDefault ? "?" : ""}: ${tsType(arg.type)}`)
        .join("\n")}\n        }`
    : "never";
  let returns;
  if (outputs.length) {
    // Postgres keeps no "not null" on a function's result columns, and outer
    // joins and averages over nothing really do return null, so every one is
    // typed as possibly null. (Supabase's own generator assumes otherwise.)
    returns = `{\n${outputs
      .map((out) => `          ${key(out.name)}: ${tsType(out.type)} | null`)
      .join("\n")}\n        }[]`;
  } else {
    returns = tsType(fn.return_type) + (fn.returns_set ? "[]" : "");
  }
  return `      ${key(fn.name)}: {\n        Args: ${args}\n        Returns: ${returns}\n      }`;
}

/** The types file's text, for the database as it stands. */
export async function generateTypes(db) {
  const [cols, rels, fns] = await Promise.all([tables(db), relationships(db), functions(db)]);

  const tableBlocks = [...cols.keys()].map((table) => {
    const columns = cols.get(table);
    const links = (rels.get(table) ?? [])
      .map(
        (rel) => `          {
            foreignKeyName: ${JSON.stringify(rel.name)}
            columns: ${JSON.stringify(rel.columns)}
            isOneToOne: ${rel.oneToOne}
            referencedRelation: ${JSON.stringify(rel.referenced)}
            referencedColumns: ${JSON.stringify(rel.referenced_columns)}
          },`,
      )
      .join("\n");
    return `      ${key(table)}: {
        Row: {
${columnsBlock(columns, "Row", 10)}
        }
        Insert: {
${columnsBlock(columns, "Insert", 10)}
        }
        Update: {
${columnsBlock(columns, "Update", 10)}
        }
        Relationships: [${links ? `\n${links}\n        ` : ""}]
      }`;
  });

  return `// Generated by scripts/gen-db-types.mjs from supabase/migrations. Don't edit
// by hand: change a migration, then run \`npm run db:types\`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12"
  }
  public: {
    Tables: {
${tableBlocks.join("\n")}
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
${fns.map(functionBlock).join("\n")}
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

/** A table's row, as read. */
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
/** A table's row, as written. */
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
/** A table's row, as changed. */
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = await localDatabase();
  writeFileSync(TYPES_FILE, await generateTypes(db));
  await db.close();
  console.log(`Wrote ${TYPES_FILE}`);
}
