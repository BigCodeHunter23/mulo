-- Mixtape rank-offs. Safe to run more than once.

-- When several albums or songs tie for somebody's top score in a month, they
-- can rank them off head to head. The winner is kept here and shown as that
-- month's album or track of the month.
create table if not exists public.mixtape_picks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  kind text not null check (kind in ('album', 'song')),
  -- An album's release group, or a song's recording.
  mbid uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month, kind)
);

alter table public.mixtape_picks enable row level security;

drop policy if exists "Mixtape picks are publicly readable" on public.mixtape_picks;
create policy "Mixtape picks are publicly readable"
  on public.mixtape_picks for select using (true);

drop policy if exists "Users can add their own mixtape picks" on public.mixtape_picks;
create policy "Users can add their own mixtape picks"
  on public.mixtape_picks for insert with check (auth.uid() = user_id);

drop policy if exists "Users can change their own mixtape picks" on public.mixtape_picks;
create policy "Users can change their own mixtape picks"
  on public.mixtape_picks for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own mixtape picks" on public.mixtape_picks;
create policy "Users can remove their own mixtape picks"
  on public.mixtape_picks for delete using (auth.uid() = user_id);
