# How MULO is built

A map for someone about to change the code. What each feature does, and the
product reasons behind it, are in `CLAUDE.md`. This page covers the
structure those features sit on.

## The shape of a request

```
browser
  │
  ▼
src/proxy.ts ─────────── refreshes the Supabase session cookie, and turns
  │                      signed-out visitors away from signed-in-only pages
  ▼                      (the list is src/lib/access.ts)
src/app/**/page.tsx ──── server components: read data, render HTML
  │
  ▼
src/lib/*.ts ─────────── one module per feature (ratings, feed, charts…),
  │                      each reading through a Supabase client
  ▼
Supabase (Postgres) ──── row-level security on every table decides what
                         each request may see or change
```

Changes go the other way through **server actions** (`src/app/**/actions.ts`),
called straight from forms and buttons. A few **route handlers** cover what
isn't a page: search as you type (`/api/search`, `/api/search/wider`), the
unread-notification count, email-link sign-in (`/auth/confirm`), and
generated images (record avatars and story images).

Nothing talks to Supabase from the browser. The session cookies are
`httpOnly`, so page scripts can't read them, and every query runs on the
server.

## Supabase clients

Four, in `src/lib/supabase/`. Each is typed with the generated `Database`
schema, so a wrong table or column name fails the type check.

| Client                | Who it acts as                       | Used for                                                              |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `server.ts`           | The signed-in person (their cookie)  | Almost everything: pages, actions. One per request (React `cache`).   |
| `public.ts`           | Nobody (anon key, no cookie)         | Public reads that are the same for everyone, so they can be cached.   |
| `admin.ts`            | Service role, **bypasses RLS**       | Writing catalogue data fetched from MusicBrainz. Server only.          |
| `middleware.ts`       | The signed-in person                 | The proxy's session refresh.                                          |

Settings are read through `src/lib/env.ts`, which validates them with zod
and names any that are missing. `src/instrumentation.ts` runs that check
once when a server starts.

## Reading data

- **Nothing derived is stored.** Feeds, notifications, badges, streaks,
  taste twins, The Stack and the charts are all worked out from ratings,
  follows and reactions when they're viewed. They can never drift from the
  truth, and there's no background job to keep them up to date.
- **PostgREST returns at most 1,000 rows per request**, silently, whatever
  `.limit()` says. Two ways around it:
  - Totals and averages are counted in Postgres by SQL functions (migration
    0018: `score_totals`, the `*_chart_rows` functions, `profile_rating_stats`,
    `heavy_rotation`…) and called with `.rpc()`.
  - Lists that really need every row go through `readAll()`
    (`src/lib/supabase/read-all.ts`), which pages through 1,000 at a time.
- **Failures are logged, not thrown at the reader.** `logQueryError(area,
  error, migration?)` writes `[area] query failed: …` to Vercel's logs, and
  names the migration to run when a database function is missing. The page
  shows what it has; a whole-page failure falls to `src/app/error.tsx`.
- **Shared caching.** Reads that are the same for every visitor (The Charts,
  Heavy Rotation, Discover's top rated) are wrapped in `unstable_cache` for
  `SHARED_CACHE_SECONDS` (five minutes, `src/lib/cache-times.ts`). A failed
  read throws inside the cache, so a failure is never kept. Per-person data
  isn't cached between requests.

## Writing data: the server action pattern

Every action follows the same order, so none of them can skip a step:

1. **Validate** each argument with the schemas in `src/lib/validation.ts`.
   Actions can be called by anyone with any arguments, page or no page.
2. **Who is it?** `getCurrentUser()`. Signed out means a plain "log in"
   error, before the database is touched (`test/actions-auth.test.ts`
   checks every action for this).
3. **Rate limit** with `allowUser(bucket, user.id)` or `allowAddress(bucket)`
   (`src/lib/rate-limit.ts`, counted in Postgres by migration 0017).
4. **Write** through the session client, so row-level security applies.
5. **Refresh** the affected pages with `revalidatePath`.
6. **Return** `{ ok: true }` or `{ ok: false, error }`, with a message a
   person can read (`docs/voice.md`). Raw database errors are never shown.

## The catalogue

Albums, artists and songs come from MusicBrainz. The first time somebody
opens one, `src/lib/catalog.ts` fetches it (about one request a second, with
a descriptive User-Agent), stores it with the admin client, and serves it
from Postgres from then on. Covers are copied into Supabase storage; photos
and bios come from Wikidata and Wikipedia. Anything a person is waiting on
gets a short deadline and no retries, because MusicBrainz often rate-limits
Vercel's shared addresses. `scripts/seed-catalog.mjs` pre-loads popular
records so most pages never wait.

## Signing in

Supabase Auth with email and password. Sign-up confirmation and password
reset emails link to `/auth/confirm`, which accepts both of the shapes
Supabase sends. Where to go next is checked by `safeRedirectPath()`
(`src/lib/redirects.ts`), so a link can't bounce someone to another site.
Signed-in-only pages call `requireUser(returnTo)`, which sends signed-out
visitors to log in and brings them back afterwards.

## Security headers

`next.config.ts` sets the headers. Framing by other sites, plugins and
`<base>` rewriting are blocked outright. A full Content Security Policy runs
in report-only mode while it's checked against real traffic.
`e2e/headers.spec.ts` checks the headers are actually sent.

## The database schema

- `supabase/migrations/` holds numbered SQL files. The owner runs each one
  by hand in the Supabase SQL editor, so every migration must be **safe to
  run twice** (`if not exists`, `create or replace`, guarded `do` blocks).
- `src/lib/supabase/database.types.ts` is generated from those migrations by
  `npm run db:types`. The generator replays them on PGlite (Postgres compiled
  to WebAssembly, `scripts/local-db.mjs`), so it needs neither Docker nor
  access to the live project. A unit test fails if the file is out of date.
- New code must not assume a migration has run: if it depends on one, say
  so in `docs/supabase-setup.md`, and where practical fall back gracefully
  (the existing fallbacks log which migration is missing).

## Tests

| Layer   | Where                          | Runs                                                                                  |
| ------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| Unit    | `src/**/*.test.ts`, `test/`    | `npm test` (Vitest). Pure logic, action auth checks, migrations replayed in PGlite.   |
| Browser | `e2e/`                         | `npm run test:e2e` (Playwright) against a production build.                           |

The signed-out browser tests need no database. The signed-in ones need a
non-production Supabase project and the `E2E_*` settings, and skip without
them. CI (`.github/workflows/ci.yml`) runs everything on every push.

## Where things are

```
src/
  app/          routes; each folder is a URL. actions.ts files hold server actions
  components/   shared UI; ui.tsx has the primitives (buttons, fields, notices, pager)
  lib/          feature logic and data access, one module per feature
    supabase/   the four clients, generated types, paging and error helpers
  proxy.ts      session refresh and the signed-in-only gate
  instrumentation.ts  startup environment check
supabase/
  migrations/   numbered SQL, run by hand in order
  checks/       read-only queries to run before a risky migration
scripts/        maintenance scripts (seeding, covers) and the type generator
test/           unit tests that span modules
e2e/            Playwright browser tests
docs/           voice guide, Supabase steps, hardening audit, this page
```

Design tokens (colours, type, motion) live in `src/app/globals.css` as
Tailwind v4 theme variables. Every animation there is switched off under
`prefers-reduced-motion`.
