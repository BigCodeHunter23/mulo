-- Following relationships. Created ahead of the social phase because the
-- "average among people you follow" score needs to query it.
create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_id_idx
  on public.follows (following_id);

alter table public.follows enable row level security;

create policy "Follows are publicly readable"
  on public.follows for select
  using (true);

create policy "Users can follow on their own behalf"
  on public.follows for insert
  with check (auth.uid() = follower_id);

create policy "Users can unfollow on their own behalf"
  on public.follows for delete
  using (auth.uid() = follower_id);
