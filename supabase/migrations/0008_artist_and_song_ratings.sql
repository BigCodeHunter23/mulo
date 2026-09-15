-- Artist ratings, song ratings, and the songs those point at.
-- Safe to run more than once.

-- Songs ----------------------------------------------------------------------
-- A song is a MusicBrainz "recording". It keeps one identity, and one set of
-- ratings, wherever it appears, and survives an album's tracklist being
-- corrected. Cached from MusicBrainz like the rest of the catalogue.
create table if not exists public.songs (
  mbid uuid primary key,
  title text not null,
  duration_ms integer,
  cached_at timestamptz not null default now()
);

alter table public.songs enable row level security;

drop policy if exists "Songs are publicly readable" on public.songs;
create policy "Songs are publicly readable"
  on public.songs for select
  using (true);

-- Each track on an album points at its song. Tracklists saved before this
-- have none yet; they get fetched again from the album's standard edition.
alter table public.tracks
  add column if not exists song_mbid uuid references public.songs (mbid);

create index if not exists tracks_song_mbid_idx on public.tracks (song_mbid);

-- Set once an album's tracklist comes from its standard edition, with songs.
alter table public.releases
  add column if not exists tracks_cached_at timestamptz;

-- Two people opening the same album at once could both save its tracklist.
-- Clear any doubles that already exist, then rule them out.
delete from public.tracks a
  using public.tracks b
  where a.release_mbid = b.release_mbid
    and a.position = b.position
    and a.id > b.id;

create unique index if not exists tracks_release_position_key
  on public.tracks (release_mbid, position);

-- Artist ratings ---------------------------------------------------------------
-- One overall score per person per artist, with an optional review.
create table if not exists public.artist_ratings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  artist_mbid uuid not null references public.artists (mbid) on delete cascade,
  score smallint not null check (score between 1 and 10),
  review text check (char_length(review) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, artist_mbid)
);

create index if not exists artist_ratings_artist_mbid_idx
  on public.artist_ratings (artist_mbid);
create index if not exists artist_ratings_user_id_created_idx
  on public.artist_ratings (user_id, created_at desc);

alter table public.artist_ratings enable row level security;

drop policy if exists "Artist ratings are publicly readable" on public.artist_ratings;
create policy "Artist ratings are publicly readable"
  on public.artist_ratings for select
  using (true);

drop policy if exists "Users can insert their own artist ratings" on public.artist_ratings;
create policy "Users can insert their own artist ratings"
  on public.artist_ratings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own artist ratings" on public.artist_ratings;
create policy "Users can update their own artist ratings"
  on public.artist_ratings for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own artist ratings" on public.artist_ratings;
create policy "Users can delete their own artist ratings"
  on public.artist_ratings for delete
  using (auth.uid() = user_id);

drop trigger if exists artist_ratings_touch_updated_at on public.artist_ratings;
create trigger artist_ratings_touch_updated_at
  before update on public.artist_ratings
  for each row execute function public.touch_updated_at();

-- Song ratings -----------------------------------------------------------------
-- Scores only. Songs are for quick reactions; reviews live with albums and
-- artists.
create table if not exists public.song_ratings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  song_mbid uuid not null references public.songs (mbid) on delete cascade,
  -- The album the song was rated on: its cover, and grouping in the feed.
  release_mbid uuid not null references public.releases (mbid) on delete cascade,
  score smallint not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, song_mbid)
);

create index if not exists song_ratings_song_mbid_idx
  on public.song_ratings (song_mbid);
create index if not exists song_ratings_release_mbid_idx
  on public.song_ratings (release_mbid);
create index if not exists song_ratings_user_id_created_idx
  on public.song_ratings (user_id, created_at desc);

alter table public.song_ratings enable row level security;

drop policy if exists "Song ratings are publicly readable" on public.song_ratings;
create policy "Song ratings are publicly readable"
  on public.song_ratings for select
  using (true);

drop policy if exists "Users can insert their own song ratings" on public.song_ratings;
create policy "Users can insert their own song ratings"
  on public.song_ratings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own song ratings" on public.song_ratings;
create policy "Users can update their own song ratings"
  on public.song_ratings for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own song ratings" on public.song_ratings;
create policy "Users can delete their own song ratings"
  on public.song_ratings for delete
  using (auth.uid() = user_id);

drop trigger if exists song_ratings_touch_updated_at on public.song_ratings;
create trigger song_ratings_touch_updated_at
  before update on public.song_ratings
  for each row execute function public.touch_updated_at();

-- Reports can also point at an artist review --------------------------------------
alter table public.reports
  add column if not exists reported_artist_rating_id bigint
    references public.artist_ratings (id) on delete cascade;

-- Swap "a review or a profile" for "exactly one of the three". The original
-- rule was never named, so find it by what it checks.
do $$
declare
  existing text;
begin
  for existing in
    select conname
    from pg_constraint
    where conrelid = 'public.reports'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%reported_profile_id%'
  loop
    execute format('alter table public.reports drop constraint %I', existing);
  end loop;
end $$;

alter table public.reports
  add constraint reports_one_target check (
    num_nonnulls(reported_rating_id, reported_artist_rating_id, reported_profile_id) = 1
  );

create unique index if not exists reports_unique_artist_rating
  on public.reports (reporter_id, reported_artist_rating_id)
  where reported_artist_rating_id is not null;
