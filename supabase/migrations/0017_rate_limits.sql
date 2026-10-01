-- Rate limits, counted in Postgres so nothing new has to be run or paid for.
--
-- Each limited thing (logging in, posting a take, fetching an album MULO
-- hasn't seen before…) counts hits per person or per address in fixed
-- windows: "30 a minute" means at most 30 between :00 and :59. The app asks
-- rate_limit_hit() before doing the work, and stops when it says no.
--
-- Only the server touches this, with the service role. Nobody can read or
-- call it through the public API.
--
-- Safe to run more than once.

create table if not exists public.rate_limits (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, subject, window_start)
);

alter table public.rate_limits enable row level security;
-- No policies on purpose: with RLS on and none defined, the public API sees nothing.
revoke all on public.rate_limits from anon, authenticated;

/**
 * Counts one hit and says whether it is still within the limit.
 * p_bucket: what is being limited ('login', 'write'…).
 * p_subject: who: a user id, or an address for signed-out requests.
 */
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits as r (bucket, subject, window_start, hits)
  values (p_bucket, left(p_subject, 200), v_window, 1)
  on conflict (bucket, subject, window_start)
    do update set hits = r.hits + 1
  returning hits into v_hits;

  -- Finished windows are no use to anybody. Tidy them away now and then
  -- rather than on a schedule, so nothing has to run on a timer.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;
