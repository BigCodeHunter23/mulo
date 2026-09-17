-- Loves and nahs on Daily Versus picks, so a friend's pick can show in your
-- feed and be reacted to. Safe to run more than once.

-- Picks were keyed by matchup and person; give each one an id a reaction can
-- point at. Existing picks get one straight away.
alter table public.versus_votes
  add column if not exists id bigint generated always as identity;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.versus_votes'::regclass
      and conname = 'versus_votes_id_key'
  ) then
    alter table public.versus_votes add constraint versus_votes_id_key unique (id);
  end if;
end $$;

alter table public.reactions
  add column if not exists versus_vote_id bigint
    references public.versus_votes (id) on delete cascade;

-- Swap the "exactly one target" rule for one that includes picks.
do $$
declare
  existing text;
begin
  for existing in
    select conname
    from pg_constraint
    where conrelid = 'public.reactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%num_nonnulls%'
  loop
    execute format('alter table public.reactions drop constraint %I', existing);
  end loop;
end $$;

alter table public.reactions
  add constraint reactions_one_target check (
    num_nonnulls(rating_id, artist_rating_id, versus_take_id, versus_vote_id) = 1
  );

create unique index if not exists reactions_one_per_versus_vote
  on public.reactions (user_id, versus_vote_id) where versus_vote_id is not null;
create index if not exists reactions_versus_vote_idx
  on public.reactions (versus_vote_id);
