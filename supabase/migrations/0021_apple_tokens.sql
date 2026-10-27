-- Apple's refresh token for each account that signed in with Apple, so
-- deleting the account can cancel its Sign in with Apple link, as Apple
-- requires. Encrypted by the website; only the service role reads it.
--
-- Safe to run more than once.

create table if not exists public.apple_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  client_id text not null check (char_length(client_id) <= 200),
  refresh_token text not null check (char_length(refresh_token) <= 4000),
  created_at timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;
revoke all on public.apple_tokens from anon, authenticated;

-- No policies: nobody but the service role reads or writes it.
