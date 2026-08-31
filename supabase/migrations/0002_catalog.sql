-- Catalog tables, cached from MusicBrainz + Cover Art Archive on first lookup.
create table if not exists public.artists (
  mbid uuid primary key,
  name text not null,
  image_url text,
  bio text,
  cached_at timestamptz not null default now()
);

create table if not exists public.releases (
  mbid uuid primary key,
  title text not null,
  artist_mbid uuid references public.artists (mbid) on delete cascade,
  release_date text,
  cover_art_url text,
  genres text[] not null default '{}',
  cached_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id bigint generated always as identity primary key,
  release_mbid uuid not null references public.releases (mbid) on delete cascade,
  position integer not null,
  title text not null,
  duration_ms integer
);

create index if not exists tracks_release_mbid_idx on public.tracks (release_mbid);
create index if not exists releases_artist_mbid_idx on public.releases (artist_mbid);

-- Row Level Security: catalog data is public to read. Nobody writes to these
-- tables through the normal client — caching happens server-side using the
-- service role key, which bypasses RLS entirely, so no insert/update policies
-- are defined here on purpose.
alter table public.artists enable row level security;
alter table public.releases enable row level security;
alter table public.tracks enable row level security;

create policy "Artists are publicly readable"
  on public.artists for select
  using (true);

create policy "Releases are publicly readable"
  on public.releases for select
  using (true);

create policy "Tracks are publicly readable"
  on public.tracks for select
  using (true);
