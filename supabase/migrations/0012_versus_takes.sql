-- Takes on the Daily Versus, with loves and nahs, and reports. Safe to run more
-- than once.

-- A take: why somebody picked their side, in 280 characters or fewer. One
-- each per matchup, and only from people who picked in it.
create table if not exists public.versus_takes (
  id bigint generated always as identity primary key,
  matchup_id bigint not null references public.versus_matchups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now(),
  unique (matchup_id, user_id)
);

create index if not exists versus_takes_matchup_idx
  on public.versus_takes (matchup_id, created_at desc);

alter table public.versus_takes enable row level security;

drop policy if exists "Versus takes are publicly readable" on public.versus_takes;
create policy "Versus takes are publicly readable"
  on public.versus_takes for select using (true);

drop policy if exists "Users can post a take where they picked" on public.versus_takes;
create policy "Users can post a take where they picked"
  on public.versus_takes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.versus_votes v
      where v.matchup_id = versus_takes.matchup_id
        and v.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own takes" on public.versus_takes;
create policy "Users can delete their own takes"
  on public.versus_takes for delete using (auth.uid() = user_id);

-- Loves and nahs can point at a take as well as a review. Swap the "exactly
-- one target" rule for one that includes takes.
alter table public.reactions
  add column if not exists versus_take_id bigint
    references public.versus_takes (id) on delete cascade;

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
    num_nonnulls(rating_id, artist_rating_id, versus_take_id) = 1
  );

create unique index if not exists reactions_one_per_versus_take
  on public.reactions (user_id, versus_take_id) where versus_take_id is not null;
create index if not exists reactions_versus_take_idx
  on public.reactions (versus_take_id);

-- Takes can be reported too.
alter table public.reports
  add column if not exists reported_versus_take_id bigint
    references public.versus_takes (id) on delete cascade;

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
      reported_versus_take_id
    ) = 1
  );

create unique index if not exists reports_unique_versus_take
  on public.reports (reporter_id, reported_versus_take_id)
  where reported_versus_take_id is not null;
