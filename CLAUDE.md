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
  reactions, Versus picks) rather than stored; when someone last looked lives
  in a cookie.
- Daily Versus (`src/app/versus`, `src/lib/versus.ts`): one matchup a day on
  Sydney time, taken in order from the hand-picked lineup in
  `src/lib/versus-pairs.ts`, which loops. The first visit of a day creates
  that day's row, so nothing runs on a timer. The database only accepts picks
  for today's matchup, and the split stays hidden until someone picks.
  Changing `VERSUS_START` or reordering pairs changes future days only. Each
  pair has a title ("King of New York") and a plain tagline. Takes
  (`versus_takes`, migration 0012) are one short comment per person who
  picked, with Love/Nah reactions and reports; they stay hidden until you pick,
  and the whole section hides itself if the table doesn't exist yet.
- Raised On (`src/components/RaisedOnPicker.tsx`, `src/lib/eras.ts`): decades,
  scenes and five albums each, picked during signup or at
  `/profile/raised-on`. `eras.ts` holds MusicBrainz ids and cover URLs for
  albums already in the catalogue; add new ones to the catalogue first. The
  chosen album becomes a "record avatar": `avatar_url` holds the path
  `/records/{mbid}`, drawn as a picture disc by `src/app/records/[mbid]` at a
  few fixed sizes (the `Avatar` component asks for the right one). Uploading a
  photo replaces it. The picker keeps its step (decade, scene, record, the
  confirm sheet) in the address bar through `history.pushState`, so a phone's
  back swipe goes back one step.
- Navigation: on phones the header is just the logo, People and the bell, and
  `MobileNav` is a tab bar along the bottom (hidden during `/welcome`); the
  layout leaves room for it. Wider screens use the header links.
- Motion lives in `globals.css` (clash, crown drop, sparks, deal-in, count-up
  and friends) and every animation is switched off under
  `prefers-reduced-motion`. `Celebrate.tsx` has the crown and sparks.
- `scripts/seed-catalog.mjs` pre-loads popular albums and is safe to stop and
  rerun; `scripts/copy-covers.mjs` copies covers into storage.

## Gotchas

- PostgREST joins: one table with foreign keys to both `artists` and
  `releases` would make every `releases → artists` join ambiguous. That's why
  `top_artists` and `top_albums` are separate tables.
- Share images (`next/og`) need `display: flex` on every element with more
  than one child, text-only boxes included, and can't take React fragments.
  They can't read WebP either; `loadImage` swaps Wikimedia WebP photos for a
  PNG copy (Commons only makes thumbnails at set widths, such as 250 and 500).
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
