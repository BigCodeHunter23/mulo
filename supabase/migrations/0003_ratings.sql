-- One rating per user per release, editable. Review text is optional.
create table if not exists public.ratings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  release_mbid uuid not null references public.releases (mbid) on delete cascade,
  score smallint not null check (score between 1 and 10),
  review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, release_mbid)
);

create index if not exists ratings_release_mbid_idx on public.ratings (release_mbid);
create index if not exists ratings_user_id_created_idx
  on public.ratings (user_id, created_at desc);

alter table public.ratings enable row level security;

-- Ratings and reviews are public: they are the point of the site.
create policy "Ratings are publicly readable"
  on public.ratings for select
  using (true);

-- A user may only write, change or remove their own rating.
create policy "Users can insert their own ratings"
  on public.ratings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own ratings"
  on public.ratings for update
  using (auth.uid() = user_id);

create policy "Users can delete their own ratings"
  on public.ratings for delete
  using (auth.uid() = user_id);

-- Keep updated_at honest without relying on the client to set it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ratings_touch_updated_at on public.ratings;
create trigger ratings_touch_updated_at
  before update on public.ratings
  for each row execute function public.touch_updated_at();
