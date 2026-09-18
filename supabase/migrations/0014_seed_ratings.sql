-- A starting score for things nobody on MULO has rated yet.
--
-- The problem this solves: on day one almost every album and artist has no
-- ratings at all, and a page showing a dash where a score should be reads as
-- broken rather than new. Somebody arriving should see a number.
--
-- Where the number comes from: MusicBrainz keeps its own community ratings,
-- out of five, on release groups and artists. MULO already fetches both of
-- those records, so the rating rides along on a request that was happening
-- anyway — no extra API calls, no rate-limit cost, and the same open licence
-- the rest of the catalogue is under.
--
-- How it's used: exactly one vote, never more. An album with a seed and five
-- MULO ratings averages six numbers. As real ratings arrive the seed's share
-- shrinks on its own, and past a handful of real ratings it drops out
-- entirely — by then MULO has its own answer and an outside number would only
-- muddy it.
--
-- Deliberately not used: ListenBrainz play counts, which are already stored in
-- `popularity`. Those measure how much something is played, not how good it
-- is, and turning plays into a score would say popular means good, which is
-- the opposite of what MULO is for. They stay where they are, ordering
-- discovery.
--
-- Safe to run more than once.

-- Out of ten, to match every other score on MULO. MusicBrainz works out of
-- five, so it is doubled on the way in.
alter table public.releases
  add column if not exists seed_score numeric(3, 1)
    check (seed_score is null or (seed_score >= 1 and seed_score <= 10)),
  -- How many people voted on MusicBrainz. A 5.0 from one vote is noise, so
  -- the code ignores a seed that too few people stood behind.
  add column if not exists seed_votes integer,
  -- Where it came from, so a future source can be told apart and so the site
  -- can always say whose number it is showing.
  add column if not exists seed_source text;

alter table public.artists
  add column if not exists seed_score numeric(3, 1)
    check (seed_score is null or (seed_score >= 1 and seed_score <= 10)),
  add column if not exists seed_votes integer,
  add column if not exists seed_source text;
