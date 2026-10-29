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

**The app API** (`src/app/api/app/v1/`) serves the MULO phone app. It signs
people in by bearer token, never by cookie: `src/lib/supabase/server.ts`
reads `Authorization: Bearer`, so every lib function and action acts as the
right person unchanged, and the proxy (`src/lib/app-proxy.ts`) answers CORS
for `/api/app/*` and drops cookies there, so a page elsewhere can't borrow
somebody's website session. Handlers are thin and built from
`src/lib/app-route.ts`: check the caller (`appCaller`, or `signedInCaller`
where an account is needed), read the input, call the same lib function or
action a page uses, answer JSON. A token that doesn't verify is a 401
everywhere, so the app knows to refresh it; writes answer with the action's
own `{ ok, error }`. Reads that cost the database something call
`limitReads` (the `read` limit, per person or per address). Every shape they answer with is declared in
`src/lib/app-api.ts`, which the app copies, so it stays framework-free (its
test says how): types, plus the few plain strings the app matches an answer
on (`NOT_FRESH`, `OTHER_ACCOUNT`). New endpoints go in `test/app-api.test.ts`; Collection's
(badges, GOAT, Mixtape, the Gauntlet, taste) are in
`test/app-api-collection.test.ts`, and Social and account's (lists,
notifications, reactions, reports, blocks, follows, invites, profile
editing, Raised On, the account) in `test/app-api-social.test.ts`. Social log-ins (`auth/apple`: the iPhone's own
Apple sheet, checked by Supabase) are in `test/app-api-auth-social.test.ts`.
Google, and Apple off the iPhone, go through the browser: `auth/oauth/start` answers
the page to open and `state`, Supabase's PKCE storage (`src/lib/oauth.ts`), which
the app hands back with the code to `auth/oauth/exchange`, so nothing is kept here and
a caught `mulo://` link is useless without it. Only `mulo://auth/callback` is
ever asked for as the return address, and Supabase's Redirect URLs list is the
real boundary. Confirming it's them sends `expectedUserId` to `auth/apple` or
`auth/oauth/exchange`: another account is answered 409 `OTHER_ACCOUNT`, its
session ended and, if the sign-in had just made it (no profile, under two
minutes old), the account deleted, before any Apple token is kept
(`src/lib/other-account.ts`). Every
`users/[username]/*` endpoint finds its person through `visibleProfile`
(`src/lib/app-profile.ts`), so blocked people are a 404 everywhere; a list by
somebody blocked is a 404 too, and `lists.ts`, `notifications.ts` and
`reactions.ts` leave blocked people out of what they read, for pages and the
app alike. Changing the password or email, and deleting an account, live in
`src/lib/account.ts`, shared by the account page's actions and the app; each
checks the password by signing in on a client of its own, so the caller's
session is never touched. The data export is `src/lib/export.ts`, served at
`/profile/account/export` and `me/export`.

`getSessionFacts()` (`src/lib/session-facts.ts`) says how somebody signed in:
their sign-in methods, whether they have a password (the providers include
email, or `app_metadata.has_password`), and whether the sign-in is fresh (an
`amr` entry for a real sign-in, such as `password` or `oauth`, within five
minutes; a second factor or a refresh never counts). `cameFromResetLink()`
reads the same claims for `/auth/update-password`, which only a reset link's
own session (within fifteen minutes) may use. An account made with Apple or Google has
no password, so the account page and the app's `me/password` let it set one,
and ask for a fresh sign-in instead of a password before changing or deleting
anything. Apple requires deleting an account to cancel its Sign in with Apple
link: `src/lib/apple.ts` builds the client secret, swaps codes and revokes, and
`src/lib/apple-tokens.ts` keeps Apple's refresh token sealed in `apple_tokens`
(migration 0021, service role only; `keepAppleTokenFrom` after a browser
sign-in with Apple, `forgetAppleLink` revokes it before the account goes). The
`APPLE_*` settings are in `.env.example`.

**The word filter** (`src/lib/content-filter.ts`) holds what people write to
two standards. `isClean` (names, usernames, bios, list titles) refuses
swearing and slurs; `isRespectful` (reviews, Versus takes, list descriptions
and notes) refuses slurs and hate only. The server actions call them
(`saveProfile`, the list actions, `saveReview`, `postTake`), so the app API,
which calls the same actions, is covered with no extra work. A new free-text
field calls one of them in its action.

Nothing talks to Supabase from the browser. The session cookies are
`httpOnly`, so page scripts can't read them, and every query runs on the
server.

## Supabase clients

Four, in `src/lib/supabase/`. Each is typed with the generated `Database`
schema, so a wrong table or column name fails the type check.

| Client                | Who it acts as                       | Used for                                                              |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `server.ts`           | The signed-in person (their cookie, or the app's bearer token) | Almost everything: pages, actions, the app API. One per request (React `cache`). |
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
from Postgres from then on. Covers are shown straight from the Cover Art
Archive and never stored, since 15,000 albums of them outgrew the storage
allowance; `coverSrc()` reads any old stored-cover address as the archive's. Photos
and bios come from Wikidata and Wikipedia. Anything a person is waiting on
gets a short deadline and no retries, because MusicBrainz often rate-limits
Vercel's shared addresses. `scripts/seed-catalog.mjs` pre-loads popular
records so most pages never wait.

## Signing in

Supabase Auth with email and password, plus Continue with Apple and Google
(the `continueWith` action on `/login`; the phone app's routes are above).
Sign-up confirmation and password
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

## Push notifications

The phone app gets pushes through Expo's push service. Three tables hold what
that needs: `personal_settings` (each person's switches, time zone and when
they were last here), `push_devices` (the phones) and `push_log` (every push
sent, with Expo's ticket). They're private on purpose: `profiles` can be read
by anyone, and a time zone or a last visit must not be. Only the service role
reaches them, through `src/lib/push/store.ts`. A person's copy of their data
(`src/lib/export.ts`) includes their settings and phones, never a phone's
token.

A push starts one of two ways. A follow or a love fires one straight away:
the action saves, then `later()` runs `events.ts` after the response, so
nobody waits on it. Everything timed (today's Versus, the week's Drop, a
streak about to end) comes from the clock: Supabase's `pg_cron` calls
`/api/app/v1/push/tick` every 15 minutes with a shared secret, and `tick.ts`
works out who is due. "Due" is judged on each person's own clock: their time
zone comes from the app when it registers and from the browser
(`ClockReporter`), and falls back to Sydney. Streaks are counted in that zone
too (`src/lib/streak.ts`); badges stay on Sydney time. Nobody is sent timed
pushes after 30 days away.

Each push claims a row in `push_log` before it's sent, keyed by person, kind
and a key that says how often that kind may go: a follow once a day per
follower, a love once an hour per rating or take, Versus and streaks once per
local day, the Drop once a week. A repeated run or a retry can't send it
twice. Nobody gets more than ten follow and love pushes in an hour; past that
they still show in the bell. The clock claims and sends up to 100 phones at a
time and starts no batch (of pushes or receipts) after its 40-second budget,
so what it leaves was never claimed and goes on the next run.

```
src/lib/push/
  zones.ts       time zones: validate and spell canonically, fall back to Sydney, local day and minutes
  who.ts         pure rules: slots, away for 30 days, switches, log keys
  messages.ts    the wording of every push, with names and titles cleaned and cut
  expo.ts        the only code that talks to Expo (send, receipts), checking its answers
  batches.ts     batches of 100 pushes or 1000 receipts, and the clock's deadline
  store.ts       every database read and write for pushes
  send.ts        filters by switches, claims in the log, sends, records tickets
  receipts.ts    checks Expo's receipts and drops phones that are gone
  events.ts      notifyFollow, notifyLove, and the cap of ten an hour
  later.ts       runs a task after the response
  tick.ts        the clock's run: Versus, Drop, streak, receipts, pruning
  tick-auth.ts   checks the clock's secret
```

The endpoints are `push/devices` (register or remove a phone),
`push/devices/forget`, `me/notifications` (read and change the switches) and
`push/tick`, all under `/api/app/v1`. `push/devices/forget` takes a phone's
token and forgets it whatever account it's on, with no sign-in, since the app
calls it whenever an account leaves the phone (a log-out, an ended session, a
deleted account), by when there may be no session. It's limited per address
and always answers `{ ok: true }`. Knowing a token only lets you stop pushes
to that phone, which registering it again already could. Setting up the clock
is in `docs/supabase-setup.md`.

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
  setup/        one-off SQL for the project itself (the push clock)
scripts/        maintenance scripts (seeding, covers) and the type generator
test/           unit tests that span modules
e2e/            Playwright browser tests
docs/           voice guide, Supabase steps, hardening audit, this page
```

Design tokens (colours, type, motion) live in `src/app/globals.css` as
Tailwind v4 theme variables. Every animation there is switched off under
`prefers-reduced-motion`.
