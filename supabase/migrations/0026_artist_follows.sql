-- Following artists, and new release alerts.
--
-- artist_follows: who follows which artist. Public, like follows: profiles
-- count and list them, artist pages count them. Each person adds and
-- removes their own, up to 2,000 (a trigger keeps the limit).
--
-- new_releases: albums and EPs crediting at least one followed artist, with
-- every artist credited, found once a day in ListenBrainz's fresh releases
-- by the clock (push/tick) and confirmed with MusicBrainz. Anyone may read
-- them; only the service role writes.
--
-- artist_release_reads: the clock's daily read of fresh releases and its
-- tries. Service role only.
--
-- releases.kind tells an album from an EP (null: an album cached before
-- this migration), and artists.eps_cached_at says an artist's EPs have been
-- read from MusicBrainz, as albums_cached_at does for their albums.
--
-- Safe to run more than once.

alter table public.releases add column if not exists kind text;
alter table public.releases drop constraint if exists releases_kind_check;
alter table public.releases
  add constraint releases_kind_check check (kind is null or kind in ('album', 'ep'));

alter table public.artists add column if not exists eps_cached_at timestamptz;

create table if not exists public.artist_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  artist_mbid uuid not null references public.artists (mbid) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_mbid)
);

create index if not exists artist_follows_artist_idx on public.artist_follows (artist_mbid);
create index if not exists artist_follows_user_created_idx
  on public.artist_follows (user_id, created_at desc);

alter table public.artist_follows enable row level security;
-- A follow is made or removed, never edited.
revoke update on public.artist_follows from anon, authenticated;

drop policy if exists "Artist follows are publicly readable" on public.artist_follows;
create policy "Artist follows are publicly readable"
  on public.artist_follows for select
  using (true);

drop policy if exists "People follow artists for themselves" on public.artist_follows;
create policy "People follow artists for themselves"
  on public.artist_follows for insert
  with check (auth.uid() = user_id);

drop policy if exists "People unfollow artists for themselves" on public.artist_follows;
create policy "People unfollow artists for themselves"
  on public.artist_follows for delete
  using (auth.uid() = user_id);

/**
 * At most 2,000 artists each. One person's follows are added one statement
 * at a time, so two at once can't both slip under the limit; a statement
 * adding several sees the rows it added before.
 */
create or replace function public.artist_follows_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('artist_follows:' || new.user_id::text, 0));
  if (select count(*) from public.artist_follows f where f.user_id = new.user_id) >= 2000 then
    raise exception 'artist follows full' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.artist_follows_cap() from public, anon, authenticated;

drop trigger if exists artist_follows_cap on public.artist_follows;
create trigger artist_follows_cap
  before insert on public.artist_follows
  for each row
  execute function public.artist_follows_cap();

create table if not exists public.new_releases (
  release_group_mbid uuid primary key,
  -- The artist it shows as: MusicBrainz's first credited, once confirmed.
  -- Until then the first credited artist somebody follows, whom MULO has.
  artist_mbid uuid not null references public.artists (mbid) on delete cascade,
  -- Every credited artist, followed or not: the followers of each hear about
  -- it, people who follow one only later included.
  artist_mbids uuid[] not null,
  title text not null check (char_length(title) between 1 and 500),
  kind text not null check (kind in ('album', 'ep')),
  release_date date not null,
  -- The day ListenBrainz listed it on, to notice when that moves.
  listed_date date not null,
  found_at timestamptz not null default now(),
  -- MusicBrainz agreed it's a new album or EP by that artist; or it didn't.
  confirmed_at timestamptz,
  refused_at timestamptz,
  check (cardinality(artist_mbids) between 1 and 100 and artist_mbid = any (artist_mbids))
);

create index if not exists new_releases_artists_idx
  on public.new_releases using gin (artist_mbids) where confirmed_at is not null;
create index if not exists new_releases_day_idx
  on public.new_releases (release_date) where confirmed_at is not null;
create index if not exists new_releases_waiting_idx
  on public.new_releases (found_at) where confirmed_at is null and refused_at is null;

alter table public.new_releases enable row level security;
revoke all on public.new_releases from anon, authenticated;
grant select on public.new_releases to anon, authenticated;

drop policy if exists "New releases are publicly readable" on public.new_releases;
create policy "New releases are publicly readable"
  on public.new_releases for select
  using (true);

create table if not exists public.artist_release_reads (
  day date primary key,
  tries smallint not null default 0 check (tries between 0 and 4),
  read_at timestamptz
);

alter table public.artist_release_reads enable row level security;
revoke all on public.artist_release_reads from anon, authenticated;

/**
 * Claims one try at a UTC day's read of fresh releases: true while it isn't
 * done and has had fewer than four tries.
 */
create or replace function public.claim_release_read(p_day date)
returns boolean
language sql
set search_path = ''
as $$
  with claimed as (
    insert into public.artist_release_reads as r (day, tries) values (p_day, 1)
    on conflict (day) do update set tries = r.tries + 1
      where r.read_at is null and r.tries < 4
    returning 1
  )
  select exists (select 1 from claimed)
$$;

revoke execute on function public.claim_release_read(date) from public, anon, authenticated;
grant execute on function public.claim_release_read(date) to service_role;

/** Of these artists, the ones somebody follows: the clock's filter for fresh releases. */
create or replace function public.followed_among(p_mbids uuid[])
returns table (artist_mbid uuid)
language sql
stable
set search_path = ''
as $$
  select distinct f.artist_mbid from public.artist_follows f where f.artist_mbid = any (p_mbids)
$$;

revoke execute on function public.followed_among(uuid[]) from public, anon, authenticated;
grant execute on function public.followed_among(uuid[]) to service_role;

/**
 * Confirmed releases between two days credited to any artist somebody
 * follows, once each, with when they first followed one of its artists:
 * Home's shelf and the bell's lines. Each is named for its first credited
 * artist, whichever of them they follow.
 */
create or replace function public.followed_releases(p_user uuid, p_from date, p_to date)
returns table (
  release_group_mbid uuid,
  title text,
  kind text,
  release_date date,
  artist_mbid uuid,
  artist_name text,
  followed_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  -- "artist_mbids @> array[x]" is "x = any (artist_mbids)" in the form the
  -- GIN index answers.
  select n.release_group_mbid, n.title, n.kind, n.release_date, n.artist_mbid, a.name,
    min(f.created_at)
  from public.artist_follows f
  join public.new_releases n on n.artist_mbids @> array[f.artist_mbid]
  join public.artists a on a.mbid = n.artist_mbid
  where f.user_id = p_user
    and n.confirmed_at is not null
    and n.release_date between p_from and p_to
  group by n.release_group_mbid, a.name
  order by n.release_date desc, n.title
  limit 200
$$;

revoke execute on function public.followed_releases(uuid, date, date) from public;
grant execute on function public.followed_releases(uuid, date, date)
  to anon, authenticated, service_role;

/**
 * The artists the signed-in person rates highest and doesn't follow yet,
 * best first: their artist ratings of 6 and up (three points a point), their
 * album ratings of 7 and up (a point a point, for the album's artist), their
 * GOAT (30 points for the top artist down to 3 for the tenth; 20 down to 2
 * for an album's artist), and their diary (a point for each day they played
 * the artist's albums, up to 20). Runs as the reader, so a diary counts only
 * for its owner.
 */
create or replace function public.artist_suggestions(p_limit integer)
returns table (mbid uuid, name text, image_url text)
language sql
stable
set search_path = ''
as $$
  with points as (
    select ar.artist_mbid as artist, ar.score * 3 as weight
    from public.artist_ratings ar
    where ar.user_id = auth.uid() and ar.score >= 6
    union all
    select r.artist_mbid, ra.score
    from public.ratings ra
    join public.releases r on r.mbid = ra.release_mbid
    where ra.user_id = auth.uid() and ra.score >= 7 and r.artist_mbid is not null
    union all
    select t.artist_mbid, (11 - t.position) * 3
    from public.top_artists t
    where t.user_id = auth.uid()
    union all
    select r.artist_mbid, (11 - t.position) * 2
    from public.top_albums t
    join public.releases r on r.mbid = t.release_mbid
    where t.user_id = auth.uid() and r.artist_mbid is not null
    union all
    select played.artist, least(count(*), 20)::int
    from (
      select distinct r.artist_mbid as artist, d.day
      from public.diary_entries d
      join public.releases r on r.mbid = d.release_mbid
      where d.user_id = auth.uid() and r.artist_mbid is not null
    ) played
    group by played.artist
  )
  select a.mbid, a.name, a.image_url
  from points p
  join public.artists a on a.mbid = p.artist
  where not exists (
    select 1 from public.artist_follows f
    where f.user_id = auth.uid() and f.artist_mbid = p.artist
  )
  group by a.mbid, a.name, a.image_url
  order by sum(p.weight) desc, a.name
  limit least(greatest(p_limit, 1), 12)
$$;

revoke execute on function public.artist_suggestions(integer) from public, anon;
grant execute on function public.artist_suggestions(integer) to authenticated;

-- The New releases push switch, and the push log's new kind.
alter table public.personal_settings
  add column if not exists notify_releases boolean not null default true;

alter table public.push_log drop constraint if exists push_log_kind_check;
alter table public.push_log
  add constraint push_log_kind_check
  check (kind in ('follow', 'love', 'reply', 'versus', 'drop', 'streak', 'diary', 'release'));
