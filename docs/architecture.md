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
follower, a love once an hour per rating or take, a reply once an hour per
thread, Versus and streaks once per local day, the Drop once a week. A
repeated run or a retry can't send it twice. Nobody gets more than ten
follow, love and reply pushes in an hour; past that they still show in the
bell. The clock claims and sends up to 100 phones at a time and starts no
batch (of pushes or receipts) after its 40-second budget, so what it leaves
was never claimed and goes on the next run.

```
src/lib/push/
  zones.ts       time zones: validated, spelt canonically, Sydney by default; local day and minutes
  who.ts         pure rules: slots, away for 30 days, switches, log keys
  messages.ts    the wording of every push, with names and titles cleaned and cut
  expo.ts        the only code that talks to Expo (send, receipts), checking its answers
  batches.ts     batches of 100 pushes or 1000 receipts, and the clock's deadline
  store.ts       every database read and write for pushes
  send.ts        filters by switches, claims in the log, sends, records tickets
  receipts.ts    checks Expo's receipts and drops phones that are gone
  events.ts      notifyFollow, notifyLove, notifyReply, and the limit of ten an hour
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

## Replies

Anyone signed in can answer a written album or artist review, or a Versus
take, in one flat thread, oldest first (migration 0024, table `replies`).
Each thread has one address on the website and in the app:
`/album/<mbid>/reviews/<rating id>`, `/artist/<mbid>/reviews/<artist rating
id>` and `/versus/<day>/takes/<take id>`; an address whose parts don't agree
is not found. A take on today's Versus stays locked until you've picked, as
takes do on the Versus page.

Row-level security holds the reading and deleting rules: signed-in people
read replies except by or to people hidden from them (`hidden_profiles()`),
and delete their own replies or any on their own review or take. Signed-out
visitors read none. Nothing is edited. Clearing a review's words deletes its
replies (a trigger), so a later review never inherits an old thread. Every
read and delete goes through the visitor's own client for those rules to
apply.

Writing is different: nobody signed in may insert into `replies` directly.
`postReply` in `src/app/replies/actions.ts` makes every check first (format
characters dropped, trimmed, 1 to 1,000 characters, `isRespectful`, the
`post` rate limit, at most 50 replies from one person in one thread, and
`replyable`, which reads the thread as the visitor and calls it gone when
it's deleted, has no words, or its writer is hidden either way; a take on
today's Versus is locked until you've picked), then writes the reply with
the service role, as the signed-in person. Through a session of their own,
someone could otherwise skip the rate limit, the word filter, the
pick-first lock and the record of who a reply names. The database still
sets whose thread it is and refuses a reply to a bare score.

`src/lib/replies.ts` reads threads (`getThread`: the newest 500 replies,
shown oldest first, with a line saying so when there are more) and counts
(`getReplyCounts`, filled into `Review`, feed items and takes when a page is
read, through the database's `reply_counts`, a call per hundred ids, run as
the visitor so hidden people's replies aren't counted; signed out the link
just says "Replies"), and says whether you may reply. The thread page reads
fresh for each visitor, so after a post or delete it refreshes with
`router.refresh()` rather than `revalidatePath`. `src/lib/replies-shared.ts`
holds the plain rules the app copies: limits, format characters, @name
parsing (an "@" and a username, not after a letter or digit; the first five
different names count) and thread addresses.

A reply pushes its review's or take's author ("Jo replied to your review of
Blonde") and the people it names ("Jo mentioned you on Sam's review of
Blonde"), through `notifyReply` in `src/lib/push/events.ts`: once an hour per
thread for each person, never across a block, under the Replies switch, and
not to anyone who's already had ten follow, love and reply pushes in the
past hour. A named author gets the author's push only. An @name tells
somebody (a push, and a `mention` line in the bell) only when they have a
connection: they follow the replier, the replier follows them, or they've
replied in the thread before. A stranger's @name is still a link to their
profile, and tells them nothing. `resolveMentions` holds that rule once for
both, reading follows and earlier replies with the service role. The bell's
`reply`, `mention` and `thread` lines come from
`src/lib/reply-notifications.ts`.
Reported replies land in the admin inbox with Remove reply; a report reads
the reply as the reporter (so one hidden from them can't be reported) and
keeps its first 1,000 characters in the report's detail, after the
reporter's own words (`src/lib/reported-reply.ts`). The report outlives
the reply: `reported_reply_id` is set to null when the reply goes (deleted
by its writer, the review's owner or the admin, a cleared review, or a
deleted account), and the inbox shows it as "Reply removed" with the words
it kept and no Remove button. Remove reply also closes the open reports about
it. The database allows at most one target per report; the insert
policy, like the report form, still asks for exactly one, so a report with
none is always one whose reply has gone.

The app API: `GET threads/{album|artist|take}/{id}` (answers `state: "open"`,
`"gone"` or `"locked"`), `POST replies`, `DELETE replies/{id}`, and `POST
reports` with `{ kind: "reply", id }`.

## Listening diary

A diary is an album on a day: each album somebody listened to on one day, in
their own time zone (migration 0025). An album-day counts when four of its
songs, or twenty minutes of it, were played that day (`albumDays` in
`src/lib/diary-shared.ts`, the rules the app copies). Three tables:

- `diary_entries`: the album-days, one per person, day and album name
  (`album_key`, the artist and album folded together), with the album once
  it's matched (`release_mbid`), how many songs, minutes and plays, and
  which sources it came from. Read through the visitor's own session:
  `diary_visible` lets anyone, signed out too, read a public diary except
  across a block, and only the owner read a private one
  (`profiles.diary_public`, Show my diary). Readers are granted every
  column but `song_hint`, the most played song, which is only for matching.
- `album_matches`: shared by everybody, one row per album name, with the
  album it was matched to, so each name is looked up once, and whose diary
  brought it in (`added_by`).
- `diary_sources`: each person's imports and their state, with the Last.fm
  name and the time zone it connected in, never a Last.fm session key. Only
  the service role reads it; the owner sees its state.

Only the website writes, with the service role, after its own checks (signed
in, zod, the rate limit, names tidied, the listen rule), through one
database function, `diary_merge`: the same album on the same day from
another source merges into the entry already there, keeping the larger counts
and adding the source. A new entry takes the album its owner chose for those
names before (Which album is this), ahead of the shared match. The merge
keeps a diary to 50,000 entries itself, one merge at a time per person: new
entries past that are skipped (and counted), merges always apply, and an
upload none of whose new albums fit says the diary is full.
`diary_remove_source` takes one source off every entry and deletes the
entries it alone added; deleting entries forgets the names nobody is
waiting on any more (`diary_forget_names`). `src/lib/diary/entries.ts`
holds the writes, `read.ts` the reads.

The clock (`push/tick`, every 15 minutes) moves the diary on after the
pushes, in `src/lib/diary/tick.ts`:

1. **Matching** (`match.ts`): names waiting in `album_matches`, the longest
   waiting first, taken in turns between the diaries that brought them in
   (ten each a run at most, so one big upload can't hold everybody else
   up), are looked up in ListenBrainz in bulk (50 a run), by one of the
   album's songs, then in MusicBrainz's search, one a second. A found album
   goes into the catalogue with what the lookup gave; its page fetches the
   rest on its first visit. A name nothing finds waits an hour, then six,
   and after three tries is "no match", which its owners can fix with Which
   album is this (`/diary/fix/<id>`). Then `diary_sweep` gives the album to
   any entry saved just as its name was matched.
2. **Last.fm** (`lastfm-jobs.ts`): an import reads somebody's history newest
   first, a page at a time, holding the oldest day of each page back until
   the next page has finished it, so a day split across pages counts whole.
   Once it reaches the start, the account is synced every hour by reading
   back 26 hours, so today is always counted whole; merging keeps the larger
   counts, so reading a day again never lowers it. Last.fm plays have no
   length, so each counts as three and a half minutes. Days are read on the
   clock kept with the account (`diary_sources.time_zone`, the zone it
   connected in; without one, the person's own zone, or UTC, kept from
   then on), so a traveller's re-read files nothing on another day. A page
   that doesn't say how many pages there are is tried again next run.

Connecting Last.fm (`lastfm.ts`) sends people to Last.fm's approval page and
back to `/diary/lastfm/callback` with a single-use state that lasts ten
minutes and says who they are, whether they came from the website or the
app, and their time zone. One started on the website also sets a ten-minute
HttpOnly cookie (path `/diary/lastfm`) holding a hash of the state, and the
callback finishes it only with that cookie, so a link can't connect
somebody else's Last.fm to the sender's MULO; the app's browser sheet has
no cookies, so its connects rely on the single-use state. The session
Last.fm gives back only proves whose account it is and isn't kept: plays
are read by name. The callback address, and the website's redirects after
it, are built from `callbackOrigin()`, so `NEXT_PUBLIC_SITE_URL` decides
where Last.fm returns.

Spotify's extended streaming history is read where it's picked: in the
browser on `/diary/import` (`src/lib/diary/read-spotify.ts`, with `fflate`
for the zip) or on the phone. A history can run to a hundred megabytes, so
it's read a file at a time into a running tally (`createAlbumTally`), and
files that can't be read are counted and mentioned. Only album-days are
sent, 500 at a time; a batch held by the rate limit waits a minute and goes
again; the last call says the import is done, for the bell line and the
push. Apple Music's library is read by the iPhone app.

Your data copy (`src/lib/export.ts`) has the diary's entries and sources,
never a connect's state. The app API: `GET diary/{username}?before=`,
`POST diary/entries` (log a listen), `POST diary/entries/batch`, `DELETE
diary/entries/{id}`, `POST diary/entries/{id}/album` (Which album is this),
`DELETE diary/sources/{source}`, `POST diary/lastfm/start` (with an
optional `{ timeZone }`), and `GET/PATCH me/diary` (Show my diary).

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
