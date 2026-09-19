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
  the reason to scroll a chart at all. Genre charts are strict: each artist has one main
  genre (`src/lib/main-genre.ts`: a tag is what its last word says, "pop
  rap" is rap; the family their albums' tags point at most wins) and their
  albums and songs appear under that genre only. The badge ladders still
  match loosely on purpose.
- Starting scores (migration 0014): an album or artist nobody here has rated
  borrows MusicBrainz's own community rating, doubled from five to ten, as
  exactly one vote, retiring past ten real ratings (`SEED_RETIRES_AT` in
  `ratings.ts`). It rides along on `inc=ratings` on calls `catalog.ts` already
  makes. Pages that lean on one say so. Writes drop the seed and retry if the
  columns aren't there yet, so code and migration can land in either order. An album
  with no rating of its own falls back to its artist's, pulled towards the
  middle of the scale (`FROM_ARTIST` in `ratings.ts`), which covers the nine in
  ten empty albums whose artist does have one.
- Badges (`src/lib/badge-catalog.ts` for the list, `src/lib/badges.ts` for who
  has what, `src/components/BadgeIcon.tsx` for the glyphs): one-offs in five
  groups, plus twelve genre ladders of four rungs
  each (10 / 25 / 50 / 100 albums rated in that genre). Nothing is stored:
  every badge is worked out from ratings on each view, so it can never drift
  from the truth. The board lives at `/u/{username}/badges`, with `/badges` as
  a shortcut to your own. Earning one is announced by `BadgeUnlock.tsx`: the
  screen dims, the medal lands and sparks go, several queueing one after
  another. `rate` sends back every badge the person now holds and the browser
  compares it with the last list it saw in `localStorage`, so nothing has to
  be stored server-side; an empty store is written down quietly rather than
  celebrated, so a new device never replays old badges. Each badge has its own glyph, shown dimmed while
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
- The Drop (`src/lib/drop.ts`, `src/lib/drop-lineup.ts`, `/drop`): one album a
  week for everybody, opening Monday midnight Sydney from a hand-picked
  26-week lineup (`DROP_START` fixes week one). Scores are ordinary album
  ratings; the spread stays hidden until you've rated. `DropBanner` and
  `GuessBanner` sit at the top of `DiscoverSections`.
- The Gauntlet (`src/lib/gauntlet.ts`, `/artist/[mbid]/gauntlet`): an artist's
  unrated albums as a Stack run, oldest first, ending at the shareable ranking
  `/u/[username]/ranks/[artist]` (podium, then the rest). `FinishTheSet` on
  artist pages shows progress and leads into it.
- Guess the score (`src/lib/guess.ts`, `/guess`): ten popular albums, guess
  the "Everyone" score; best score kept in localStorage.
- Streaks (`src/lib/streak.ts`, `StreakFlame`): consecutive Sydney days with
  any activity, read from timestamps on ratings, reactions, Versus picks and
  takes, GOAT and Mixtape rows. Nothing stored.
- Stack cards lead with "Hits from this album": ListenBrainz play counts per
  song (`src/lib/hits.ts`, one POST per run, cached a day), falling back to
  opening tracks. Cards fly off on rate or pass, with a five-second undo.
  `seed-catalog.mjs --tracklists` fills missing tracklists.
- Hot takes: `rate` returns the crowd (`getCrowd`: everyone else plus the
  starting score, so the page's "Everyone" number before you rated);
  `RatingForm` asks for a review when a score lands 3+ away from it.
- Listening: `ListenOn` links album pages to Spotify, Apple Music and YouTube
  Music searches. `PreviewPlayer` plays Apple's 30-second previews on album
  tracklists and Stack hits, looked up in the browser (`src/lib/preview.ts`;
  Apple allows about 20 searches a minute per address, too few to share
  Vercel's). Apple's terms: stream only, never store, credit Apple Music and
  link to the song beside the player. Deezer was rejected: its API terms
  forbid any commercial use.
- Lists (migration 0015, `src/lib/lists.ts`, `src/app/lists`): people's own
  lists of up to 100 albums, ranked or not, each with an optional note.
  `/lists` (yours and recent), `/lists/new?add=<mbid>`, `/lists/[id]` (owner
  edits in place: reorder, notes, add by catalogue search, delete; others can
  report), `/u/[username]/lists`. `AddToList` on album pages, "On these lists"
  at their foot, a row on Discover. Actions keep positions running 1, 2, 3.
  Reported lists show in the admin inbox with a Remove list button.
- Versus nominations (0015, `src/lib/nominations.ts`, `Nominations.tsx` at
  the foot of today's Versus): two artists, no free text. A pairing is stored
  once with the lower id on the left; nominating an existing one backs it.
  Most-backed first: the owner picks from here for `versus-pairs.ts`.
- Taste twin of the week (`src/lib/taste-twin.ts`, `TasteTwin` on the home
  page): the closest scorer on shared albums and artists (5+ in common), with
  the closest few (within 5 points) taking turns by The Drop's week number.
  Nothing stored; hides itself when nobody qualifies.
- Milestones (`src/lib/milestones.ts`): the 10th, 25th, 50th, 100th… album
  rating. `rate` reports one only for a fresh rating (`created_at` equals
  `updated_at`); `BadgeUnlock` celebrates it first in the queue (not during
  `/welcome`) and links the share page `/u/[username]/milestone/[count]`,
  which 404s for a count not yet reached.
- Search runs the wider MusicBrainz search automatically once typing pauses
  (`/api/search/wider`, `WiderResults`), rather than needing Enter.
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
  rerun; `--genres` tops up genres the popularity run misses (house, techno,
  country, reggae…) by their most-played artists, and `--artists=<mbids>`
  adds artists MusicBrainz hasn't tagged at all; `--top-artists` adds
  ListenBrainz's top ~1,000 artists that are missing (its published limit); `scripts/copy-covers.mjs` copies covers into storage;
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
