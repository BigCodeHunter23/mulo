-- Replies on reviews: anyone signed in can answer a written album or artist
-- review, or a Versus take, in one flat thread, oldest first.
--
-- Nothing else is stored: counts are worked out when a page is read
-- (reply_counts below). A block hides replies both ways, through
-- hidden_profiles() (0020). Signed-out visitors can't read replies at all.
-- Replies can't be edited; delete and post again.
--
-- Only the website writes replies, with the service role, after its own
-- checks: the rate limit, the word filter, a block either way, the
-- pick-first lock on an open take, and who a reply names. People signed in
-- can read and delete through their own session, but not insert, so none of
-- those checks can be skipped by writing to the table directly.
--
-- The table is shaped like reactions (no unique pair of person and review),
-- so PostgREST never takes it for a link table between profiles and ratings,
-- and existing `profiles!inner` joins stay unambiguous. Keep it that way.
--
-- Safe to run more than once.

create table if not exists public.replies (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating_id bigint references public.ratings (id) on delete cascade,
  artist_rating_id bigint references public.artist_ratings (id) on delete cascade,
  versus_take_id bigint references public.versus_takes (id) on delete cascade,
  body text not null check (char_length(btrim(body, E' \t\r\n')) between 1 and 1000),
  created_at timestamptz not null default now(),
  -- Whose review or take it answers, set by replies_thread_owner below, so
  -- the bell finds the replies to somebody without joining three tables. No
  -- foreign key: a second link to profiles would make the `profiles` embeds
  -- on replies ambiguous, and the reply goes with the review or take anyway.
  thread_owner_id uuid,
  constraint replies_one_target
    check (num_nonnulls(rating_id, artist_rating_id, versus_take_id) = 1),
  -- Only a written review or a take has an owner, so a reply to a bare score
  -- (or a review cleared a moment ago) is refused, whoever writes it. A check
  -- rather than "not null", so the generated types leave it to the trigger.
  constraint replies_thread_has_owner check (thread_owner_id is not null)
);

create index if not exists replies_rating_idx
  on public.replies (rating_id, created_at) where rating_id is not null;
create index if not exists replies_artist_rating_idx
  on public.replies (artist_rating_id, created_at) where artist_rating_id is not null;
create index if not exists replies_versus_take_idx
  on public.replies (versus_take_id, created_at) where versus_take_id is not null;
create index if not exists replies_user_idx
  on public.replies (user_id, created_at desc);
create index if not exists replies_thread_owner_idx
  on public.replies (thread_owner_id, created_at desc);

/**
 * Whose review or take a reply hangs off. Only a written review counts: a
 * score with no words, or a review whose words were cleared, has no owner
 * here, so nobody can reply to it.
 */
create or replace function public.reply_thread_owner(
  p_rating_id bigint,
  p_artist_rating_id bigint,
  p_versus_take_id bigint
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select r.user_id from public.ratings r
      where r.id = p_rating_id and nullif(btrim(r.review), '') is not null),
    (select a.user_id from public.artist_ratings a
      where a.id = p_artist_rating_id and nullif(btrim(a.review), '') is not null),
    (select t.user_id from public.versus_takes t where t.id = p_versus_take_id)
  )
$$;

-- Only the server writes replies, so only it needs this.
revoke execute on function public.reply_thread_owner(bigint, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.reply_thread_owner(bigint, bigint, bigint) to service_role;

/**
 * Fills in thread_owner_id, whatever the writer sent. Runs before the
 * row's checks, so they see the owner it sets.
 */
create or replace function public.set_reply_thread_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.thread_owner_id := public.reply_thread_owner(
    new.rating_id, new.artist_rating_id, new.versus_take_id);
  return new;
end;
$$;

revoke execute on function public.set_reply_thread_owner() from public, anon, authenticated;

drop trigger if exists replies_thread_owner on public.replies;
create trigger replies_thread_owner
  before insert or update of rating_id, artist_rating_id, versus_take_id, thread_owner_id
  on public.replies
  for each row
  execute function public.set_reply_thread_owner();

alter table public.replies enable row level security;

-- Signed out, nothing at all. Signed in, read and delete only: replies are
-- written by the website (see the top), and nobody edits one.
revoke all on public.replies from anon;
revoke insert, update, truncate, trigger, references on public.replies from authenticated;

drop policy if exists "Signed-in people read replies, except hidden people's" on public.replies;
create policy "Signed-in people read replies, except hidden people's"
  on public.replies for select to authenticated
  using (
    not exists (
      select 1 from public.hidden_profiles((select auth.uid())) h
      where h.id = replies.user_id or h.id = replies.thread_owner_id
    )
  );

-- No insert policy: the website checks a block either way before it writes.
drop policy if exists "People reply as themselves, not across a block" on public.replies;

drop policy if exists "People delete their own replies, and any on their own review" on public.replies;
create policy "People delete their own replies, and any on their own review"
  on public.replies for delete to authenticated
  using (
    (select auth.uid()) = replies.user_id
    or (select auth.uid()) = replies.thread_owner_id
  );

/**
 * How many replies each of some reviews or takes has, for the reader: one
 * row per review or take with any (`p_kind` is album, artist or take). Runs
 * as the reader, so replies by or to people hidden from them aren't counted.
 * Signed out there are no replies to read, so it answers nothing, without
 * touching a table anon can't read.
 */
create or replace function public.reply_counts(p_kind text, p_ids bigint[])
returns table (id bigint, replies bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  if p_kind = 'album' then
    return query
      select r.rating_id, count(*) from public.replies r
      where r.rating_id = any (p_ids) group by r.rating_id;
  elsif p_kind = 'artist' then
    return query
      select r.artist_rating_id, count(*) from public.replies r
      where r.artist_rating_id = any (p_ids) group by r.artist_rating_id;
  elsif p_kind = 'take' then
    return query
      select r.versus_take_id, count(*) from public.replies r
      where r.versus_take_id = any (p_ids) group by r.versus_take_id;
  end if;
end;
$$;

revoke execute on function public.reply_counts(text, bigint[]) from public;
grant execute on function public.reply_counts(text, bigint[]) to anon, authenticated, service_role;

/**
 * A review whose words are cleared (by its author, or the admin's Remove
 * review) takes its thread with it, so a later review never inherits old
 * replies. Runs as its owner: by now the review has no words, so the
 * author's own delete rights no longer reach these replies.
 */
create or replace function public.forget_replies_to_cleared_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'ratings' then
    delete from public.replies where rating_id = new.id;
  else
    delete from public.replies where artist_rating_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.forget_replies_to_cleared_review() from public, anon, authenticated;

drop trigger if exists ratings_review_cleared on public.ratings;
create trigger ratings_review_cleared
  after update of review on public.ratings
  for each row
  when (nullif(btrim(old.review), '') is not null and nullif(btrim(new.review), '') is null)
  execute function public.forget_replies_to_cleared_review();

drop trigger if exists artist_ratings_review_cleared on public.artist_ratings;
create trigger artist_ratings_review_cleared
  after update of review on public.artist_ratings
  for each row
  when (nullif(btrim(old.review), '') is not null and nullif(btrim(new.review), '') is null)
  execute function public.forget_replies_to_cleared_review();

-- Replies can be reported, like reviews and takes. Unlike them, a report
-- outlives what it's about: a reply goes when its writer or the review's
-- owner deletes it, when the review's words are cleared, or with its
-- writer's account, and the report stays, with no target, keeping the
-- reply's words it copied into its detail (below), so the inbox can still
-- deal with it. Every other target takes its reports with it, so a report
-- with no target is always one whose reply has gone. The link is named and
-- set here, so a rerun changes it on a database that ran an earlier draft.
alter table public.reports add column if not exists reported_reply_id bigint;
alter table public.reports drop constraint if exists reports_reported_reply_id_fkey;
alter table public.reports
  add constraint reports_reported_reply_id_fkey
    foreign key (reported_reply_id) references public.replies (id) on delete set null;

-- A report is about one thing, or (once its reply has gone) nothing. Nobody
-- files one about nothing: the insert policy below asks for exactly one, as
-- the website's report form does.
do $$
declare
  existing text;
begin
  for existing in
    select conname
    from pg_constraint
    where conrelid = 'public.reports'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%num_nonnulls%'
  loop
    execute format('alter table public.reports drop constraint %I', existing);
  end loop;
end $$;

alter table public.reports
  add constraint reports_at_most_one_target check (
    num_nonnulls(
      reported_rating_id,
      reported_artist_rating_id,
      reported_profile_id,
      reported_versus_take_id,
      reported_list_id,
      reported_reply_id
    ) <= 1
  );

-- 0006's policy, now also holding a new report to exactly one target.
drop policy if exists "Users can file their own reports" on public.reports;
create policy "Users can file their own reports"
  on public.reports for insert
  with check (
    (select auth.uid()) = reporter_id
    and num_nonnulls(
      reported_rating_id,
      reported_artist_rating_id,
      reported_profile_id,
      reported_versus_take_id,
      reported_list_id,
      reported_reply_id
    ) = 1
  );

create unique index if not exists reports_unique_reply
  on public.reports (reporter_id, reported_reply_id)
  where reported_reply_id is not null;

-- A reply's report keeps its words in the detail ("Reply: " and up to 1,000
-- characters, after the reporter's own 500), so the limit from 0016 grows to
-- fit. The form still holds the reporter to 500. Only ever loosened, so the
-- rows already there pass; checked without failing, as 0016 does.
alter table public.reports drop constraint if exists reports_detail_length;
alter table public.reports add constraint reports_detail_length
  check (detail is null or char_length(detail) <= 1600) not valid;

do $$
begin
  alter table public.reports validate constraint reports_detail_length;
exception when check_violation then
  raise notice 'Left reports_detail_length unvalidated: some existing reports break it.';
end $$;

-- Who each reply names, kept when it's posted, for the bell: of the first
-- five @names, the real people with a connection (they follow the replier,
-- the replier follows them, or they've replied in the thread before) who are
-- allowed to read the thread (not the replier or the thread's owner, nobody
-- blocked either way with either, and on a take whose matchup is still open,
-- only people who've picked). A stranger's @name tells them nothing. The
-- website writes it with the service role; each person reads only their own
-- rows, and a reply hidden from them stays hidden through replies' own rules.
--
-- user_id points at the account, not the profile: a table whose key is a
-- reply and a profile would look to PostgREST like a link between replies
-- and profiles, and make every `profiles` embed on replies ambiguous.
create table if not exists public.reply_mentions (
  reply_id bigint not null references public.replies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (reply_id, user_id)
);

create index if not exists reply_mentions_user_idx
  on public.reply_mentions (user_id, reply_id desc);

alter table public.reply_mentions enable row level security;

revoke all on public.reply_mentions from anon;
revoke insert, update, delete, truncate on public.reply_mentions from authenticated;

drop policy if exists "People read where they're named" on public.reply_mentions;
create policy "People read where they're named"
  on public.reply_mentions for select to authenticated
  using (user_id = (select auth.uid()));
