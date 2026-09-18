-- Lists (people's own ranked or themed lists of albums) and Versus
-- nominations (matchups people want to see). Safe to run more than once.

-- A list: a title, an optional line about it, and up to a hundred albums.
create table if not exists public.lists (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  -- Whether the order matters: a countdown rather than a collection.
  ranked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lists_user_idx on public.lists (user_id, updated_at desc);
create index if not exists lists_recent_idx on public.lists (updated_at desc);

alter table public.lists enable row level security;

drop policy if exists "Lists are publicly readable" on public.lists;
create policy "Lists are publicly readable"
  on public.lists for select using (true);

drop policy if exists "Users can create their own lists" on public.lists;
create policy "Users can create their own lists"
  on public.lists for insert with check (auth.uid() = user_id);

drop policy if exists "Users can edit their own lists" on public.lists;
create policy "Users can edit their own lists"
  on public.lists for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own lists" on public.lists;
create policy "Users can delete their own lists"
  on public.lists for delete using (auth.uid() = user_id);

-- The albums on a list, in order, each with an optional short note.
create table if not exists public.list_items (
  list_id bigint not null references public.lists (id) on delete cascade,
  release_mbid uuid not null references public.releases (mbid) on delete cascade,
  position integer not null check (position between 1 and 100),
  note text check (note is null or char_length(note) <= 280),
  added_at timestamptz not null default now(),
  primary key (list_id, release_mbid)
);

create index if not exists list_items_order_idx on public.list_items (list_id, position);
create index if not exists list_items_release_idx on public.list_items (release_mbid);

alter table public.list_items enable row level security;

drop policy if exists "List items are publicly readable" on public.list_items;
create policy "List items are publicly readable"
  on public.list_items for select using (true);

drop policy if exists "Users can add to their own lists" on public.list_items;
create policy "Users can add to their own lists"
  on public.list_items for insert
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id and l.user_id = auth.uid()
    )
  );

drop policy if exists "Users can reorder their own lists" on public.list_items;
create policy "Users can reorder their own lists"
  on public.list_items for update
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id and l.user_id = auth.uid()
    )
  );

drop policy if exists "Users can remove from their own lists" on public.list_items;
create policy "Users can remove from their own lists"
  on public.list_items for delete
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id and l.user_id = auth.uid()
    )
  );

-- Lists carry people's own words, so they can be reported like reviews.
alter table public.reports
  add column if not exists reported_list_id bigint
    references public.lists (id) on delete cascade;

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
      reported_list_id
    ) = 1
  );

create unique index if not exists reports_unique_list
  on public.reports (reporter_id, reported_list_id)
  where reported_list_id is not null;

-- A Versus nomination: two artists somebody wants to see go head to head.
-- Each pairing exists once, stored in a fixed order (the lower id on the
-- left) so "Nas vs Jay-Z" and "Jay-Z vs Nas" are the same nomination; anyone
-- else who wants it backs it instead. Only artists, no free text, so there's
-- nothing to moderate: the owner picks the best-backed and writes the title.
create table if not exists public.versus_nominations (
  id bigint generated always as identity primary key,
  left_artist_mbid uuid not null references public.artists (mbid) on delete cascade,
  right_artist_mbid uuid not null references public.artists (mbid) on delete cascade,
  nominated_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (left_artist_mbid < right_artist_mbid),
  unique (left_artist_mbid, right_artist_mbid)
);

alter table public.versus_nominations enable row level security;

drop policy if exists "Versus nominations are publicly readable" on public.versus_nominations;
create policy "Versus nominations are publicly readable"
  on public.versus_nominations for select using (true);

drop policy if exists "Users can nominate a matchup" on public.versus_nominations;
create policy "Users can nominate a matchup"
  on public.versus_nominations for insert with check (auth.uid() = nominated_by);

-- Who backs each nomination, the nominator included.
create table if not exists public.versus_nomination_backers (
  nomination_id bigint not null references public.versus_nominations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (nomination_id, user_id)
);

create index if not exists versus_nomination_backers_user_idx
  on public.versus_nomination_backers (user_id);

alter table public.versus_nomination_backers enable row level security;

drop policy if exists "Nomination backers are publicly readable" on public.versus_nomination_backers;
create policy "Nomination backers are publicly readable"
  on public.versus_nomination_backers for select using (true);

drop policy if exists "Users can back a nomination" on public.versus_nomination_backers;
create policy "Users can back a nomination"
  on public.versus_nomination_backers for insert with check (auth.uid() = user_id);

drop policy if exists "Users can withdraw their backing" on public.versus_nomination_backers;
create policy "Users can withdraw their backing"
  on public.versus_nomination_backers for delete using (auth.uid() = user_id);
