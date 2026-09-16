-- Raised On, invite links and Daily Versus. Safe to run more than once.

-- Raised On: the era, scene and album that raised somebody, and the colours
-- of the record avatar made from it.
alter table public.profiles
  add column if not exists raised_era text,
  add column if not exists raised_scene text,
  add column if not exists raised_on_mbid uuid references public.releases (mbid) on delete set null,
  add column if not exists record_colors text[];

-- Invite links. Each person's code is private to them, so an invite can only
-- come from someone they shared it with.
create table if not exists public.invites (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique
    default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  created_at timestamptz not null default now()
);

alter table public.invites enable row level security;

drop policy if exists "Users can read their own invite" on public.invites;
create policy "Users can read their own invite"
  on public.invites for select using (auth.uid() = user_id);

drop policy if exists "Users can create their own invite" on public.invites;
create policy "Users can create their own invite"
  on public.invites for insert with check (auth.uid() = user_id);

-- Daily Versus: one matchup a day, created by the site itself.
create table if not exists public.versus_matchups (
  id bigint generated always as identity primary key,
  day date not null unique,
  left_artist_mbid uuid not null references public.artists (mbid) on delete cascade,
  right_artist_mbid uuid not null references public.artists (mbid) on delete cascade,
  created_at timestamptz not null default now(),
  check (left_artist_mbid <> right_artist_mbid)
);

alter table public.versus_matchups enable row level security;

drop policy if exists "Versus matchups are publicly readable" on public.versus_matchups;
create policy "Versus matchups are publicly readable"
  on public.versus_matchups for select using (true);

-- One vote each, cast only while the matchup is running (days run on Sydney time).
create table if not exists public.versus_votes (
  matchup_id bigint not null references public.versus_matchups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  pick text not null check (pick in ('left', 'right')),
  created_at timestamptz not null default now(),
  primary key (matchup_id, user_id)
);

create index if not exists versus_votes_user_idx on public.versus_votes (user_id);

alter table public.versus_votes enable row level security;

drop policy if exists "Versus votes are publicly readable" on public.versus_votes;
create policy "Versus votes are publicly readable"
  on public.versus_votes for select using (true);

drop policy if exists "Users can vote in today's versus" on public.versus_votes;
create policy "Users can vote in today's versus"
  on public.versus_votes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.versus_matchups m
      where m.id = matchup_id
        and m.day = (now() at time zone 'Australia/Sydney')::date
    )
  );
