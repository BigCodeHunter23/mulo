@AGENTS.md

# MULO

A social rating site for music ("IMDb for music"): people rate albums, artists
and songs out of 10, follow each other, and see three scores wherever something
is rated. Yellow is everyone, red is you, blue is the people you follow. Live
at https://mulo-plum.vercel.app. The owner isn't a developer: explain changes
in plain language, and give them links and exact steps when they need to act.

## Stack

- Next.js 16 App Router (`src/proxy.ts`, not middleware), React 19, Tailwind v4
  with design tokens in `src/app/globals.css`.
- Supabase for Postgres, auth and storage, in Sydney. Vercel is pinned to
  `syd1` beside it. A push to `master` deploys.
- Catalogue from MusicBrainz, at about one request a second with a descriptive
  User-Agent, cached in Postgres. Covers are copied into Supabase storage.
  Artist photos and bios come from Wikidata and Wikipedia; popularity from
  ListenBrainz.

## Rules

- Every table has row-level security. Server-side catalogue writes use the
  service-role client in `src/lib/supabase/admin.ts`, which must never reach
  the browser.
- Migrations live in `supabase/migrations/`. The owner runs each one in the
  Supabase SQL editor, so hand over the SQL with the link, and make every
  migration safe to run twice.
- Feeds are queries, never stored fan-out tables.
- Secrets live in `.env.local` and Vercel, never in the repo or the chat.
- Voice: `docs/voice.md`. Features and badges can carry music culture; section
  headings, buttons, navigation and errors stay plain.

## Where things are

- `src/lib/`: `catalog.ts` (MusicBrainz caching), `ratings.ts`, `feed.ts`,
  `reviews.ts`, `reactions.ts`, `badges.ts`, `taste.ts`, `top-picks.ts` (GOAT),
  `mixtape.ts` (monthly recap), `trending.ts` (Heavy Rotation), `search.ts`.
- `src/app/`: `album/[mbid]`, `artist/[mbid]`, `u/[username]` (plus `mixtape`),
  `goat`, `ratings`, `discover`, `search`, `welcome` (onboarding, with intro
  cards after signup), `profile` (settings), `notifications`, and
  `admin/reports` (the moderation inbox, open only to emails in the
  `ADMIN_EMAILS` environment variable).
- Notifications, like feeds, are read from existing tables (follows,
  reactions) rather than stored; when someone last looked lives in a cookie.
- `scripts/seed-catalog.mjs` pre-loads popular albums and is safe to stop and
  rerun; `scripts/copy-covers.mjs` copies covers into storage.

## Gotchas

- PostgREST joins: one table with foreign keys to both `artists` and
  `releases` would make every `releases → artists` join ambiguous. That's why
  `top_artists` and `top_albums` are separate tables.
- Share images (`next/og`) need `display: flex` on every element with more
  than one child, text-only boxes included, and can't take React fragments.
- Server actions refuse bodies over 1MB, so avatars are cropped in the browser
  to a 512px JPEG before upload.
- MusicBrainz often rate-limits Vercel's shared addresses. Anything a person is
  waiting on (search) gets no retries and a short deadline.
- After renaming or removing routes, delete `.next` before `npm run build`:
  stale generated route types there fail the type check.
- Check build and lint exit codes directly. Piping them through `head` in an
  `&&` chain hides a failure.

## Testing

An agent can't sign in, so signed-in pages can't be driven directly. To check
them, write temporary rows under the test accounts (`diagtest99`, `alextest`)
with the service role, view the pages signed out, then delete the rows.
