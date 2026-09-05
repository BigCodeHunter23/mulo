-- Reports raised by users against a review or a profile.
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  -- Exactly one of these is set, depending on what is being reported.
  reported_rating_id bigint references public.ratings (id) on delete cascade,
  reported_profile_id uuid references public.profiles (id) on delete cascade,
  reason text not null,
  detail text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  check (
    (reported_rating_id is not null and reported_profile_id is null)
    or (reported_rating_id is null and reported_profile_id is not null)
  ),
  check (status in ('open', 'reviewed', 'dismissed'))
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- A user may raise a report as themselves.
create policy "Users can file their own reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

-- A user can see reports they filed, and nobody else's. Moderation happens
-- in the Supabase dashboard, which uses the service role and bypasses this.
create policy "Users can read their own reports"
  on public.reports for select
  using (auth.uid() = reporter_id);

-- One report per person per item, so a single user cannot flood the queue.
create unique index if not exists reports_unique_rating
  on public.reports (reporter_id, reported_rating_id)
  where reported_rating_id is not null;

create unique index if not exists reports_unique_profile
  on public.reports (reporter_id, reported_profile_id)
  where reported_profile_id is not null;
