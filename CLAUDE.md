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
  `reviews.ts`, `reactions.ts`, `badges.ts` + `badge-catalog.ts`, `taste.ts`,
  `top-picks.ts` (GOAT),
  `mixtape.ts` (monthly recap), `trending.ts` (Heavy Rotation), `search.ts`,
  `charts.ts` (The Charts).
- `src/app/`: `album/[mbid]`, `artist/[mbid]`, `u/[username]` (plus `mixtape`),
  `goat`, `ratings`, `discover`, `charts`, `search`, `welcome` (onboarding, with intro
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
- The Charts (`src/lib/charts.ts`, `src/app/charts`): top hundred albums, songs
  and artists, over everything or one of the twelve genre families the badge
  ladders already match on, at `/charts?type=&genre=`. Ordering uses a weighted
  average in the shape IMDb ranks its Top 250 with, so a record with three
  ratings can't outrank one with four hundred; the number shown stays the plain
  average. Charts count MULO's own ratings only — never the starting scores
  below. `getChartProgress` marks what the signed-in person has rated, which is
  the reason to scroll a chart at all.
- Starting scores (migration 0014): an album or artist nobody here has rated
  borrows MusicBrainz's own community rating, doubled from five to ten, as
  exactly one vote, retiring past ten real ratings (`SEED_RETIRES_AT` in
  `ratings.ts`). It rides along on `inc=ratings` on calls `catalog.ts` already
  makes. Pages that lean on one say so. Writes drop the seed and retry if the
  columns aren't there yet, so code and migration can land in either order.
- Badges (`src/lib/badge-catalog.ts` for the list, `src/lib/badges.ts` for who
  has what, `src/components/BadgeIcon.tsx` for the glyphs): one-offs in five
  groups, plus twelve genre ladders of four rungs
  each (10 / 25 / 50 / 100 albums rated in that genre). Nothing is stored:
  every badge is worked out from ratings on each view, so it can never drift
  from the truth. The board lives at `/u/{username}/badges`, with `/badges` as
  a shortcut to your own. Each badge has its own glyph, shown dimmed while
  locked so the board reads as a collection to fill; what a locked badge took
  to earn stays hidden, which was always the part worth keeping back. Genre
  families match whole words against MusicBrainz genre tags, so "rap" catches
  "pop rap" but not "trap"; a ladder's four rungs share their family's glyph.
- The Stack (`src/lib/stack.ts`, `src/app/stack`): a run of forty albums to
  rate quickly, one card at a time, ranked for one person — artists they
  already rate, then the decade and scene from Raised On, then genres they
  rate in, then popularity as the floor, with no more than three in a row by
  one artist. Nothing is stored; the run is worked out fresh each time.
  Onboarding's rate step draws its albums from here too, so a new account sees
  its own decade rather than one generic popularity list.
- Discovery (`src/lib/discover.ts`): `artistsToExplore` shuffles a wide pool
  once an hour, so the same ten famous names don't always lead; `newReleases`
  is the last few months; `similarArtists` ranks by shared genres, weighted by
  how central each genre is to the artist. `WhereNext` puts those at the foot
  of every artist and album page so a page is never a dead end.
- The home feed alternates rather than running as one long list: friends,
  Heavy Rotation, more friends, new releases, the rest of the feed, people to
  follow, then Around MULO (everyone else's recent ratings, minus anything
  already shown above).
- Navigation: on phones the header is just the logo, People and the bell, and
  `MobileNav` is a tab bar along the bottom (hidden during `/welcome`); the
  layout leaves room for it. Wider screens use the header links.
- Motion lives in `globals.css` (clash, crown drop, sparks, deal-in, count-up
  and friends) and every animation is switched off under
  `prefers-reduced-motion`. `Celebrate.tsx` has the crown and sparks.
- `scripts/seed-catalog.mjs` pre-loads popular albums and is safe to stop and
  rerun; `scripts/copy-covers.mjs` copies covers into storage;
  `scripts/seed-scores.mjs` backfills starting scores for records cached
  before 0014, which never go back to MusicBrainz on their own.

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
