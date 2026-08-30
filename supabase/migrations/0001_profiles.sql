-- Profiles table: one row per user, extending Supabase's built-in auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);

-- Row Level Security: locked down by default until policies explicitly allow access.
alter table public.profiles enable row level security;

-- Anyone (including logged-out visitors) can read any profile.
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

-- A user can only create their own profile row.
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- A user can only edit their own profile row.
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);
