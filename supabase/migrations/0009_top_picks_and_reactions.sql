-- Your GOAT: a ranked top ten of artists and of albums, plus love/dislike on
-- other people's ratings. Safe to run more than once.

-- Kept as two tables rather than one with a "kind" column: a single table
-- pointing at both artists and releases would give PostgREST a second way to
-- join those two, and every album page relies on the first one.
create table if not exists public.top_artists (
  user_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  artist_mbid uuid not null references public.artists (mbid) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, position),
  unique (user_id, artist_mbid)
);

create table if not exists public.top_albums (
  user_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  release_mbid uuid not null references public.releases (mbid) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, position),
  unique (user_id, release_mbid)
);

alter table public.top_artists enable row level security;
alter table public.top_albums enable row level security;

drop policy if exists "Top artists are publicly readable" on public.top_artists;
create policy "Top artists are publicly readable"
  on public.top_artists for select using (true);

drop policy if exists "Users can insert their own top artists" on public.top_artists;
create policy "Users can insert their own top artists"
  on public.top_artists for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own top artists" on public.top_artists;
create policy "Users can update their own top artists"
  on public.top_artists for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own top artists" on public.top_artists;
create policy "Users can delete their own top artists"
  on public.top_artists for delete using (auth.uid() = user_id);

drop policy if exists "Top albums are publicly readable" on public.top_albums;
create policy "Top albums are publicly readable"
  on public.top_albums for select using (true);

drop policy if exists "Users can insert their own top albums" on public.top_albums;
create policy "Users can insert their own top albums"
  on public.top_albums for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own top albums" on public.top_albums;
create policy "Users can update their own top albums"
  on public.top_albums for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own top albums" on public.top_albums;
create policy "Users can delete their own top albums"
  on public.top_albums for delete using (auth.uid() = user_id);

-- Love or dislike on someone's rating: one reaction per person per rating.
create table if not exists public.reactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating_id bigint references public.ratings (id) on delete cascade,
  artist_rating_id bigint references public.artist_ratings (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  check (num_nonnulls(rating_id, artist_rating_id) = 1)
);

create unique index if not exists reactions_one_per_rating
  on public.reactions (user_id, rating_id) where rating_id is not null;
create unique index if not exists reactions_one_per_artist_rating
  on public.reactions (user_id, artist_rating_id) where artist_rating_id is not null;
create index if not exists reactions_rating_idx on public.reactions (rating_id);
create index if not exists reactions_artist_rating_idx on public.reactions (artist_rating_id);

alter table public.reactions enable row level security;

drop policy if exists "Reactions are publicly readable" on public.reactions;
create policy "Reactions are publicly readable"
  on public.reactions for select using (true);

drop policy if exists "Users can insert their own reactions" on public.reactions;
create policy "Users can insert their own reactions"
  on public.reactions for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own reactions" on public.reactions;
create policy "Users can update their own reactions"
  on public.reactions for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own reactions" on public.reactions;
create policy "Users can delete their own reactions"
  on public.reactions for delete using (auth.uid() = user_id);
