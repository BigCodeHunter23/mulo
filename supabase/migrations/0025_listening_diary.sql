-- The listening diary: the albums somebody listened to, an album on a day,
-- filled by hand, from Last.fm, and from Spotify's extended streaming history.
--
-- Only the website writes here, with the service role, after its own checks
-- (the rate limit, the listen rule); diary_merge keeps the size limit itself.
-- People read diaries
-- through their own session: a public diary to anyone, signed out too, except
-- across a block; a private one to its owner only.
--
-- album_matches is shared by everybody: a cleaned "artist|album" key and the
-- album it was matched to, so each name is looked up once. diary_sources holds
-- each person's imports (their Last.fm name among them, never a session key).
-- Neither is readable outside the website, and nor is an entry's song_hint.
--
-- Safe to run more than once.

alter table public.profiles
  add column if not exists diary_public boolean not null default true;

create table if not exists public.diary_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null check (day >= date '1900-01-01'),
  album_key text not null check (char_length(album_key) between 3 and 300),
  artist_name text not null check (char_length(artist_name) between 1 and 300),
  album_name text not null check (char_length(album_name) between 1 and 300),
  -- The most played song, for matching; never shown.
  song_hint text check (song_hint is null or char_length(song_hint) <= 300),
  release_mbid uuid references public.releases (mbid) on delete set null,
  -- The owner chose the album, by hand or with "Which album is this?".
  fixed boolean not null default false,
  sources text[] not null
    check (cardinality(sources) >= 1 and sources <@ array['lastfm', 'spotify', 'apple', 'hand']),
  songs integer not null default 0 check (songs >= 0),
  minutes integer not null default 0 check (minutes between 0 and 1440),
  plays integer not null default 0 check (plays >= 0),
  created_at timestamptz not null default now(),
  constraint diary_entries_one_a_day unique (user_id, day, album_key)
);

create index if not exists diary_entries_user_day_idx
  on public.diary_entries (user_id, day desc, id desc);
create index if not exists diary_entries_unmatched_idx
  on public.diary_entries (album_key) where release_mbid is null;
create index if not exists diary_entries_release_idx
  on public.diary_entries (release_mbid) where release_mbid is not null;

create table if not exists public.album_matches (
  album_key text primary key check (char_length(album_key) between 3 and 300),
  -- The first spelling seen, for the lookups.
  artist_name text not null check (char_length(artist_name) between 1 and 300),
  album_name text not null check (char_length(album_name) between 1 and 300),
  song_hint text check (song_hint is null or char_length(song_hint) <= 300),
  -- Null while it's being matched, and for good once tries reaches 3.
  release_mbid uuid references public.releases (mbid) on delete cascade,
  matched_by text check (matched_by in ('listenbrainz', 'musicbrainz')),
  tries smallint not null default 0 check (tries between 0 and 3),
  next_try_at timestamptz not null default now(),
  tried_at timestamptz,
  -- Whose diary brought the name in, so matching takes turns between people.
  added_by uuid references auth.users (id) on delete set null
);

create index if not exists album_matches_due_idx
  on public.album_matches (next_try_at) where release_mbid is null and tries < 3;
create index if not exists album_matches_matched_idx
  on public.album_matches (tried_at) where release_mbid is not null;

create table if not exists public.diary_sources (
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('lastfm', 'spotify', 'apple')),
  state text not null default 'idle'
    check (state in ('idle', 'importing', 'syncing', 'needs_reconnect')),
  lastfm_user text check (lastfm_user is null or char_length(lastfm_user) <= 64),
  -- The listener's time zone when they connected: a Last.fm import and its
  -- syncs read days on this clock throughout, wherever they travel.
  time_zone text check (time_zone is null or char_length(time_zone) <= 64),
  -- A Last.fm import reads pages up to import_to, newest first.
  import_to timestamptz,
  import_page integer check (import_page is null or import_page >= 1),
  import_added integer not null default 0,
  -- The oldest day's plays from the last page, finished with the next page.
  carry jsonb,
  reached_back timestamptz,
  synced_to timestamptz,
  worked_at timestamptz,
  last_import_at timestamptz,
  last_count integer,
  -- A connect in progress: the hash of its single-use state, where to go back
  -- to, and the time zone it started in, which a new import takes.
  pending_hash text,
  pending_until timestamptz,
  pending_to text check (pending_to is null or pending_to in ('web', 'app')),
  pending_zone text check (pending_zone is null or char_length(pending_zone) <= 64),
  primary key (user_id, source)
);

create index if not exists diary_sources_pending_idx
  on public.diary_sources (pending_hash) where pending_hash is not null;

alter table public.diary_entries enable row level security;
alter table public.album_matches enable row level security;
alter table public.diary_sources enable row level security;

-- Readers get every column but song_hint, which is only for matching.
revoke all on public.diary_entries from anon, authenticated;
grant select (
  id, user_id, day, album_key, artist_name, album_name, release_mbid, fixed,
  sources, songs, minutes, plays, created_at
) on public.diary_entries to anon, authenticated;
revoke all on public.album_matches from anon, authenticated;
revoke all on public.diary_sources from anon, authenticated;

/**
 * Whether the person asking may see `p_owner`'s diary: their own always;
 * anybody else's when it's public and nobody has blocked anybody. Runs as its
 * owner so signed-out visitors can ask, as hidden_profiles() is closed to them.
 */
create or replace function public.diary_visible(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner = auth.uid()
    or (
      exists (select 1 from public.profiles p where p.id = p_owner and p.diary_public)
      and (
        auth.uid() is null
        or not exists (select 1 from public.hidden_profiles(auth.uid()) h where h.id = p_owner)
      )
    )
$$;

revoke execute on function public.diary_visible(uuid) from public;
grant execute on function public.diary_visible(uuid) to anon, authenticated, service_role;

drop policy if exists "Diaries are read as their owners allow" on public.diary_entries;
create policy "Diaries are read as their owners allow"
  on public.diary_entries for select to anon, authenticated
  using (public.diary_visible(user_id));

/**
 * Saves album-days for one person from one source. The same day and album
 * from another source merges in: the larger counts are kept and the sources
 * listed. A new entry takes its album from, in turn: the one chosen (`mbid`,
 * a listen logged by hand); the one its owner chose for those names before
 * ("Which album is this?"), which it keeps as chosen; or a match already
 * made. New names go into album_matches to be matched, noting whose diary
 * brought them, unless the album was chosen.
 *
 * A diary holds 50,000 entries: new ones past that are skipped, oldest days
 * first in, while merges into entries already there always apply. Answers
 * how many entries were added, merged and skipped.
 */
drop function if exists public.diary_merge(uuid, text, jsonb);
create function public.diary_merge(p_user uuid, p_source text, p_entries jsonb)
returns table (added integer, merged integer, skipped integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  diary_max constant integer := 50000;
  room integer;
begin
  -- One merge at a time for each person, so two can't both take the last room.
  perform pg_advisory_xact_lock(hashtextextended('diary_merge:' || p_user::text, 0));

  insert into public.album_matches (album_key, artist_name, album_name, song_hint, added_by)
  select distinct on (e->>'key')
    e->>'key', e->>'artist', e->>'album', nullif(e->>'songHint', ''), p_user
  from jsonb_array_elements(p_entries) e
  where nullif(e->>'mbid', '') is null
  order by e->>'key'
  on conflict (album_key) do nothing;

  select greatest(0, diary_max - count(*))::int into room
  from public.diary_entries where user_id = p_user;

  return query
  with incoming as (
    select distinct on ((e->>'day')::date, e->>'key')
      (e->>'day')::date as day,
      e->>'key' as album_key,
      e->>'artist' as artist_name,
      e->>'album' as album_name,
      nullif(e->>'songHint', '') as song_hint,
      nullif(e->>'mbid', '')::uuid as chosen,
      greatest(0, coalesce((e->>'songs')::int, 0)) as songs,
      least(1440, greatest(0, coalesce((e->>'minutes')::int, 0))) as minutes,
      greatest(0, coalesce((e->>'plays')::int, 0)) as plays
    from jsonb_array_elements(p_entries) e
    order by (e->>'day')::date, e->>'key', coalesce((e->>'songs')::int, 0) desc
  ),
  ranked as (
    select i.*,
      exists (
        select 1 from public.diary_entries d
        where d.user_id = p_user and d.day = i.day and d.album_key = i.album_key
      ) as known
    from incoming i
  ),
  kept as (
    select r.* from (
      select r.*, row_number() over (partition by r.known order by r.day, r.album_key) as n
      from ranked r
    ) r
    where r.known or r.n <= room
  ),
  saved as (
    insert into public.diary_entries as d (
      user_id, day, album_key, artist_name, album_name, song_hint,
      release_mbid, fixed, sources, songs, minutes, plays
    )
    select
      p_user, k.day, k.album_key, k.artist_name, k.album_name, k.song_hint,
      coalesce(k.chosen, f.release_mbid, m.release_mbid),
      k.chosen is not null or f.release_mbid is not null,
      array[p_source], k.songs, k.minutes, k.plays
    from kept k
    left join public.album_matches m on m.album_key = k.album_key
    left join lateral (
      select o.release_mbid from public.diary_entries o
      where o.user_id = p_user and o.album_key = k.album_key
        and o.fixed and o.release_mbid is not null
      limit 1
    ) f on true
    on conflict (user_id, day, album_key) do update set
      songs = greatest(d.songs, excluded.songs),
      minutes = greatest(d.minutes, excluded.minutes),
      plays = greatest(d.plays, excluded.plays),
      sources = (select array_agg(distinct s order by s) from unnest(d.sources || excluded.sources) s),
      song_hint = coalesce(d.song_hint, excluded.song_hint),
      release_mbid = case when excluded.fixed then excluded.release_mbid
                          else coalesce(d.release_mbid, excluded.release_mbid) end,
      fixed = d.fixed or excluded.fixed
    returning (xmax = 0) as inserted
  )
  select
    (count(*) filter (where inserted))::int,
    (count(*) filter (where not inserted))::int,
    ((select count(*) from ranked) - (select count(*) from kept))::int
  from saved;
end;
$$;

revoke execute on function public.diary_merge(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.diary_merge(uuid, text, jsonb) to service_role;

/**
 * Forgets names nobody's diary is waiting on any more: not matched yet, and
 * with no unmatched entry left. Run after entries are deleted, so matching
 * never works for a diary that's gone.
 */
create or replace function public.diary_forget_names(p_keys text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.album_matches m
  where m.album_key = any (p_keys)
    and m.release_mbid is null
    and not exists (
      select 1 from public.diary_entries d
      where d.album_key = m.album_key and d.release_mbid is null
    )
$$;

revoke execute on function public.diary_forget_names(text[]) from public, anon, authenticated;
grant execute on function public.diary_forget_names(text[]) to service_role;

/**
 * Takes one source off somebody's entries, deleting those it alone sent, and
 * forgets the names only those were waiting on. Answers how many entries
 * were deleted.
 */
create or replace function public.diary_remove_source(p_user uuid, p_source text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone integer;
  keys text[];
begin
  update public.diary_entries
     set sources = array_remove(sources, p_source)
   where user_id = p_user and p_source = any (sources) and cardinality(sources) > 1;
  with deleted as (
    delete from public.diary_entries
     where user_id = p_user and sources = array[p_source]
    returning album_key, release_mbid
  )
  select
    count(*)::int,
    coalesce(array_agg(distinct album_key) filter (where release_mbid is null), '{}')
    into gone, keys
  from deleted;
  perform public.diary_forget_names(keys);
  return gone;
end;
$$;

revoke execute on function public.diary_remove_source(uuid, text) from public, anon, authenticated;
grant execute on function public.diary_remove_source(uuid, text) to service_role;

/**
 * Gives entries the album their names were matched to after they were
 * saved: a merge can read a name a moment before matching writes its album.
 * Looks at matches from the last two days, at most 5,000 entries a run, and
 * answers how many it gave an album.
 */
create or replace function public.diary_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  swept integer;
begin
  update public.diary_entries d
     set release_mbid = w.release_mbid
    from (
      select e.id, m.release_mbid
      from public.album_matches m
      join public.diary_entries e on e.album_key = m.album_key
      where m.release_mbid is not null
        and m.tried_at > now() - interval '2 days'
        and e.release_mbid is null
        and not e.fixed
      limit 5000
    ) w
   where d.id = w.id;
  get diagnostics swept = row_count;
  return swept;
end;
$$;

revoke execute on function public.diary_sweep() from public, anon, authenticated;
grant execute on function public.diary_sweep() to service_role;

/**
 * Albums in the signed-in person's diary they haven't rated, most played
 * first: The Stack's From your listening deck.
 */
create or replace function public.diary_to_rate(p_limit integer)
returns table (release_mbid uuid, plays bigint, minutes bigint, last_day date)
language sql
stable
set search_path = ''
as $$
  select d.release_mbid, sum(d.plays), sum(d.minutes), max(d.day)
  from public.diary_entries d
  where d.user_id = auth.uid()
    and d.release_mbid is not null
    and not exists (
      select 1 from public.ratings r
      where r.user_id = d.user_id and r.release_mbid = d.release_mbid
    )
  group by d.release_mbid
  order by sum(d.plays) desc, sum(d.minutes) desc, max(d.day) desc
  limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.diary_waiting()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(distinct d.release_mbid)::int
  from public.diary_entries d
  where d.user_id = auth.uid()
    and d.release_mbid is not null
    and not exists (
      select 1 from public.ratings r
      where r.user_id = d.user_id and r.release_mbid = d.release_mbid
    )
$$;

revoke execute on function public.diary_to_rate(integer) from public, anon;
revoke execute on function public.diary_waiting() from public, anon;
grant execute on function public.diary_to_rate(integer) to authenticated;
grant execute on function public.diary_waiting() to authenticated;

/**
 * Each month's line on a diary page: different albums and minutes. Runs as
 * the reader, so a diary they can't see totals nothing.
 */
create or replace function public.diary_months(p_user uuid, p_from date, p_to date)
returns table (month text, albums integer, minutes integer)
language sql
stable
set search_path = ''
as $$
  select to_char(d.day, 'YYYY-MM'), count(distinct d.album_key)::int, sum(d.minutes)::int
  from public.diary_entries d
  where d.user_id = p_user and d.day between p_from and p_to
  group by 1
  order by 1 desc
$$;

revoke execute on function public.diary_months(uuid, date, date) from public;
grant execute on function public.diary_months(uuid, date, date) to anon, authenticated;

-- The Diary push switch, and the push log's new kind.
alter table public.personal_settings
  add column if not exists notify_diary boolean not null default true;

alter table public.push_log drop constraint if exists push_log_kind_check;
alter table public.push_log
  add constraint push_log_kind_check
  check (kind in ('follow', 'love', 'reply', 'versus', 'drop', 'streak', 'diary'));
