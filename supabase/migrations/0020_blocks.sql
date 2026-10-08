-- Blocking: one person deciding they'd rather not see another.
--
-- A block hides both ways. Their scores and reviews leave your feed, the
-- album pages you read and the people lists; yours leave theirs. Following
-- stops in both directions the moment it's set, so neither turns up in the
-- other's friends scores either.
--
-- Nobody is told they've been blocked, and the table can't be read to find
-- out: row-level security lets a person see only the blocks they made. The
-- app needs both directions to hide anything, so it asks hidden_profiles(),
-- which answers for the caller alone.
--
-- Safe to run more than once.

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'blocks' and policyname = 'see your own blocks') then
    create policy "see your own blocks" on public.blocks
      for select using (auth.uid() = blocker_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'blocks' and policyname = 'block somebody yourself') then
    create policy "block somebody yourself" on public.blocks
      for insert with check (auth.uid() = blocker_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'blocks' and policyname = 'unblock somebody yourself') then
    create policy "unblock somebody yourself" on public.blocks
      for delete using (auth.uid() = blocker_id);
  end if;
end $$;

/**
 * Everybody hidden from one person: those they blocked, and those who blocked
 * them. Only ever answers about the caller, so "who blocked me" stays out of
 * reach of anybody else.
 */
create or replace function public.hidden_profiles(p_user uuid)
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id from public.blocks b
  where b.blocker_id = p_user and auth.uid() = p_user
  union
  select b.blocker_id from public.blocks b
  where b.blocked_id = p_user and auth.uid() = p_user
$$;

revoke execute on function public.hidden_profiles(uuid) from public, anon;
grant execute on function public.hidden_profiles(uuid) to authenticated, service_role;
