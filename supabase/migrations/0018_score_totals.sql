-- Totals and averages, worked out in the database.
--
-- The API hands back at most 1,000 rows per request, whatever a query asks
-- for. Pages that fetched every rating to count and average them in the app
-- were quietly wrong past that: The Charts, profile stats, Heavy Rotation, and
-- an album's score once a thousand people had rated it. These functions do the
-- counting where the rows are and send back only the totals.
--
-- All of them only read, and they run as whoever calls them, so row-level
-- security applies exactly as it does to the tables.
--
-- Safe to run more than once.

/**
 * Everyone's total, count and average for each rated thing of one kind.
 * p_kind: 'album', 'artist' or 'song'.
 * p_mbids: only these; null for everything of that kind that has a rating.
 * p_skip_user: leave this person's rating out (the crowd before they rated).
 */
create or replace function public.score_totals(
  p_kind text,
  p_mbids uuid[] default null,
  p_skip_user uuid default null
)
returns table (mbid uuid, total bigint, votes bigint, average double precision)
language sql
stable
set search_path = ''
as $$
  select r.release_mbid, sum(r.score), count(*), avg(r.score)::double precision
  from public.ratings r
  where p_kind = 'album'
    and (p_mbids is null or r.release_mbid = any (p_mbids))
    and (p_skip_user is null or r.user_id <> p_skip_user)
  group by r.release_mbid
  union all
  select r.artist_mbid, sum(r.score), count(*), avg(r.score)::double precision
  from public.artist_ratings r
  where p_kind = 'artist'
    and (p_mbids is null or r.artist_mbid = any (p_mbids))
    and (p_skip_user is null or r.user_id <> p_skip_user)
  group by r.artist_mbid
  union all
  select r.song_mbid, sum(r.score), count(*), avg(r.score)::double precision
  from public.song_ratings r
  where p_kind = 'song'
    and (p_mbids is null or r.song_mbid = any (p_mbids))
    and (p_skip_user is null or r.user_id <> p_skip_user)
  group by r.song_mbid
$$;

/** Every rated album with its totals and what a chart row shows. */
create or replace function public.album_chart_rows()
returns table (
  mbid uuid,
  title text,
  cover_art_url text,
  release_date text,
  artist_mbid uuid,
  artist_name text,
  total bigint,
  votes bigint
)
language sql
stable
set search_path = ''
as $$
  select rel.mbid, rel.title, rel.cover_art_url, rel.release_date, a.mbid, a.name, t.total, t.votes
  from (
    select release_mbid, sum(score) as total, count(*) as votes
    from public.ratings
    group by release_mbid
  ) t
  join public.releases rel on rel.mbid = t.release_mbid
  left join public.artists a on a.mbid = rel.artist_mbid
$$;

/**
 * Every rated song with its totals. A song has no cover, year or genre of its
 * own, so it borrows the album it was first rated on.
 */
create or replace function public.song_chart_rows()
returns table (
  mbid uuid,
  title text,
  release_mbid uuid,
  cover_art_url text,
  release_date text,
  artist_mbid uuid,
  artist_name text,
  total bigint,
  votes bigint
)
language sql
stable
set search_path = ''
as $$
  select s.mbid, s.title, rel.mbid, rel.cover_art_url, rel.release_date, a.mbid, a.name, t.total, t.votes
  from (
    select song_mbid,
           sum(score) as total,
           count(*) as votes,
           (array_agg(release_mbid order by id))[1] as release_mbid
    from public.song_ratings
    group by song_mbid
  ) t
  join public.songs s on s.mbid = t.song_mbid
  join public.releases rel on rel.mbid = t.release_mbid
  left join public.artists a on a.mbid = rel.artist_mbid
$$;

/** Every rated artist with their totals. */
create or replace function public.artist_chart_rows()
returns table (mbid uuid, name text, image_url text, total bigint, votes bigint)
language sql
stable
set search_path = ''
as $$
  select a.mbid, a.name, a.image_url, t.total, t.votes
  from (
    select artist_mbid, sum(score) as total, count(*) as votes
    from public.artist_ratings
    group by artist_mbid
  ) t
  join public.artists a on a.mbid = t.artist_mbid
$$;

/**
 * An artist's best-rated songs, from ratings on their albums: highest average
 * first, then the most rated. Each song shows the album it was first rated on.
 */
create or replace function public.artist_top_songs(p_artist uuid, p_limit integer default 5)
returns table (
  mbid uuid,
  title text,
  release_mbid uuid,
  release_title text,
  cover_art_url text,
  average double precision,
  votes bigint
)
language sql
stable
set search_path = ''
as $$
  select s.mbid, s.title, rel.mbid, rel.title, rel.cover_art_url,
         t.total::double precision / t.votes, t.votes
  from (
    select sr.song_mbid,
           sum(sr.score) as total,
           count(*) as votes,
           (array_agg(sr.release_mbid order by sr.id))[1] as release_mbid
    from public.song_ratings sr
    join public.releases r on r.mbid = sr.release_mbid
    where r.artist_mbid = p_artist
    group by sr.song_mbid
  ) t
  join public.songs s on s.mbid = t.song_mbid
  join public.releases rel on rel.mbid = t.release_mbid
  order by t.total::double precision / t.votes desc, t.votes desc
  limit p_limit
$$;

/** How many albums, artists and songs somebody has rated, and their average. */
create or replace function public.profile_rating_stats(p_user uuid)
returns table (ratings bigint, average double precision)
language sql
stable
set search_path = ''
as $$
  select count(*), avg(score)::double precision
  from (
    select score from public.ratings where user_id = p_user
    union all
    select score from public.artist_ratings where user_id = p_user
    union all
    select score from public.song_ratings where user_id = p_user
  ) s
$$;

/**
 * Albums by how many different people rated them, or their songs, since a
 * moment: Heavy Rotation. Each row also carries how many people were active
 * at all and how many albums were in play, which decide whether the window
 * is busy enough to rank.
 */
create or replace function public.heavy_rotation(p_since timestamptz, p_limit integer default 10)
returns table (
  release_mbid uuid,
  people bigint,
  ratings bigint,
  total bigint,
  latest timestamptz,
  everyone bigint,
  albums bigint
)
language sql
stable
set search_path = ''
as $$
  with activity as (
    select release_mbid, user_id, score, created_at
    from public.ratings where created_at >= p_since
    union all
    select release_mbid, user_id, score, created_at
    from public.song_ratings where created_at >= p_since
  ),
  heat as (
    select release_mbid,
           count(distinct user_id) as people,
           count(*) as ratings,
           sum(score) as total,
           max(created_at) as latest
    from activity
    group by release_mbid
  )
  select h.release_mbid, h.people, h.ratings, h.total, h.latest,
         (select count(distinct user_id) from activity),
         (select count(*) from heat)
  from heat h
  order by h.people desc, h.ratings desc, h.latest desc
  limit p_limit
$$;

-- Heavy Rotation reads the latest ratings across everybody.
create index if not exists ratings_created_at_idx on public.ratings (created_at);
create index if not exists song_ratings_created_at_idx on public.song_ratings (created_at);
