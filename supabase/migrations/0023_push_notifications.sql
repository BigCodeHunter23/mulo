-- Push notifications: the phones to reach, each person's switches and clock,
-- and a log of every push sent, so nothing goes twice.
--
-- Time zone and last visit live here rather than on profiles, because
-- profiles can be read by anyone and these are nobody else's business.
-- All three tables are closed to the public roles: the website reads and
-- writes them with the service role, for a person it has already checked.
--
-- Safe to run more than once.

create table if not exists public.personal_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  time_zone text check (time_zone is null or char_length(time_zone) <= 64),
  last_seen_at timestamptz,
  notify_follows boolean not null default true,
  notify_loves boolean not null default true,
  notify_replies boolean not null default true,
  notify_versus boolean not null default true,
  notify_drop boolean not null default true,
  notify_streak boolean not null default true
);

alter table public.personal_settings enable row level security;
revoke all on public.personal_settings from anon, authenticated;

create table if not exists public.push_devices (
  token text primary key check (char_length(token) <= 200),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_devices_user_id_idx on public.push_devices (user_id);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;

create table if not exists public.push_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('follow', 'love', 'reply', 'versus', 'drop', 'streak')),
  key text not null check (char_length(key) <= 200),
  sent_at timestamptz not null default now(),
  -- Expo's ticket for each phone it went to: [{ "id": …, "token": … }].
  tickets jsonb not null default '[]'::jsonb,
  receipts_checked boolean not null default false,
  primary key (user_id, kind, key)
);

create index if not exists push_log_sent_at_idx on public.push_log (sent_at);
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;

-- No policies on any of the three: nobody but the service role reads or writes them.
