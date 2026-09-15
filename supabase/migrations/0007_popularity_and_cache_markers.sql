-- Popularity (listen counts from ListenBrainz) for ranking search and
-- discovery, and markers recording what has been fully fetched.
--
-- Before these markers, a release cached from an artist's album list looked
-- identical to one whose genres and tracklist had been fetched, and an artist
-- with a single album cached looked like a complete discography.
alter table public.artists
  add column if not exists popularity bigint,
  -- Name plus aliases (e.g. "Ye" also matches "Kanye West") for search.
  add column if not exists search_names text,
  add column if not exists albums_cached_at timestamptz;

alter table public.releases
  add column if not exists popularity bigint,
  -- The artist name as printed on the release, for search.
  add column if not exists artist_credit text,
  add column if not exists details_cached_at timestamptz;

create index if not exists artists_popularity_idx
  on public.artists (popularity desc nulls last);

create index if not exists releases_popularity_idx
  on public.releases (popularity desc nulls last);
