-- Replies on reviews: anyone signed in can answer a written album or artist
-- review, or a Versus take, in one flat thread, oldest first.
--
-- Nothing else is stored: counts are worked out when a page is read. A block
-- hides replies both ways, through hidden_profiles() (0020). Signed-out
-- visitors can't read replies at all. Replies can't be edited; delete and
-- post again.
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
  constraint replies_one_target
    check (num_nonnulls(rating_id, artist_rating_id, versus_take_id) = 1)
);

create index if not exists replies_rating_idx
  on public.replies (rating_id, created_at) where rating_id is not null;
create index if not exists replies_artist_rating_idx
  on public.replies (artist_rating_id, created_at) where artist_rating_id is not null;
create index if not exists replies_versus_take_idx
  on public.replies (versus_take_id, created_at) where versus_take_id is not null;
create index if not exists replies_user_idx
  on public.replies (user_id, created_at desc);

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

-- Only signed-in people (and the server) may call it, as with hidden_profiles().
revoke execute on function public.reply_thread_owner(bigint, bigint, bigint) from public, anon;
grant execute on function public.reply_thread_owner(bigint, bigint, bigint) to authenticated, service_role;

alter table public.replies enable row level security;

-- Signed out, nothing at all; and nobody edits a reply.
revoke all on public.replies from anon;
revoke update on public.replies from authenticated;

drop policy if exists "Signed-in people read replies, except hidden people's" on public.replies;
create policy "Signed-in people read replies, except hidden people's"
  on public.replies for select to authenticated
  using (
    not exists (
      select 1 from public.hidden_profiles((select auth.uid())) h
      where h.id = replies.user_id
         or h.id = public.reply_thread_owner(
              replies.rating_id, replies.artist_rating_id, replies.versus_take_id)
    )
  );

drop policy if exists "People reply as themselves, not across a block" on public.replies;
create policy "People reply as themselves, not across a block"
  on public.replies for insert to authenticated
  with check (
    (select auth.uid()) = replies.user_id
    and public.reply_thread_owner(
          replies.rating_id, replies.artist_rating_id, replies.versus_take_id) is not null
    and not exists (
      select 1 from public.hidden_profiles((select auth.uid())) h
      where h.id = public.reply_thread_owner(
              replies.rating_id, replies.artist_rating_id, replies.versus_take_id)
    )
  );

drop policy if exists "People delete their own replies, and any on their own review" on public.replies;
create policy "People delete their own replies, and any on their own review"
  on public.replies for delete to authenticated
  using (
    (select auth.uid()) = replies.user_id
    or (select auth.uid()) = public.reply_thread_owner(
         replies.rating_id, replies.artist_rating_id, replies.versus_take_id)
  );

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

-- Replies can be reported, like reviews and takes.
alter table public.reports
  add column if not exists reported_reply_id bigint
    references public.replies (id) on delete cascade;

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
  add constraint reports_one_target check (
    num_nonnulls(
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
