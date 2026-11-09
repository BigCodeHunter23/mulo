-- What the website keeps back, the database keeps back too. The public key lets
-- anybody read and write with their own session, past the website, so a rule
-- that lives only in the website's code isn't a rule. From the 2026-11-09
-- security audit:
--
--   Versus    Nobody sees how today's is going until they've picked, so it can't
--             sway them, and the privacy page says takes are public once the day
--             is over. Picks, takes and the replies to them were readable all along.
--   Diary     Imported names are anything anybody sends, and can't be reported.
--             Other people now see only albums matched to a real record.
--   Pictures  avatar_url accepted a file on any Supabase project, so a picture
--             could log the address of everybody who saw it. The website sets it.
--   Dates     A score's date could be made up, keeping it in Heavy Rotation.
--
-- Deploy the website that reads Versus and writes pictures with the service role
-- first. Run before it, the split shows 0 to 0 and Raised On can't set a picture.
-- Safe to run more than once. To undo it, see docs/supabase-setup.md, section 12.

/**
 * Whether the person asking may see how a matchup went: anybody once it's over,
 * and until then whoever has picked. Runs as its owner because the policies below
 * read versus_votes, which would otherwise ask this about itself.
 */
create or replace function public.versus_open_to_me(p_matchup bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.versus_matchups m
      where m.id = p_matchup
        and m.day < (now() at time zone 'Australia/Sydney')::date
    )
    or exists (
      select 1 from public.versus_votes v
      where v.matchup_id = p_matchup and v.user_id = (select auth.uid())
    )
$$;

revoke execute on function public.versus_open_to_me(bigint) from public;
grant execute on function public.versus_open_to_me(bigint) to anon, authenticated, service_role;

/** The same, asked of one take, for the replies under it. */
create or replace function public.versus_take_open_to_me(p_take bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.versus_takes t
    where t.id = p_take
      and (t.user_id = (select auth.uid()) or public.versus_open_to_me(t.matchup_id))
  )
$$;

revoke execute on function public.versus_take_open_to_me(bigint) from public;
grant execute on function public.versus_take_open_to_me(bigint) to authenticated, service_role;

do $$
begin
  drop policy if exists "Signed-in people read replies, except hidden people's" on public.replies;
  create policy "Signed-in people read replies, except hidden people's"
    on public.replies for select to authenticated
    using (
      not exists (
        select 1 from public.hidden_profiles((select auth.uid())) h
        where h.id = replies.user_id or h.id = replies.thread_owner_id
      )
      and (
        versus_take_id is null
        or user_id = (select auth.uid())
        or public.versus_take_open_to_me(versus_take_id)
      )
    );

  drop policy if exists "Versus votes are publicly readable" on public.versus_votes;
  drop policy if exists "Versus picks show once you've picked or it's over" on public.versus_votes;
  create policy "Versus picks show once you've picked or it's over"
    on public.versus_votes for select
    using (user_id = (select auth.uid()) or public.versus_open_to_me(matchup_id));

  drop policy if exists "Versus takes are publicly readable" on public.versus_takes;
  drop policy if exists "Versus takes show once you've picked or it's over" on public.versus_takes;
  create policy "Versus takes show once you've picked or it's over"
    on public.versus_takes for select
    using (user_id = (select auth.uid()) or public.versus_open_to_me(matchup_id));

  drop policy if exists "Diaries are read as their owners allow" on public.diary_entries;
  create policy "Diaries are read as their owners allow"
    on public.diary_entries for select to anon, authenticated
    using (
      user_id = (select auth.uid())
      or (release_mbid is not null and public.diary_visible(user_id))
    );

  revoke update (avatar_url) on public.profiles from anon, authenticated;

  revoke insert (created_at, updated_at), update (created_at, updated_at)
    on public.ratings from anon, authenticated;
  revoke insert (created_at, updated_at), update (created_at, updated_at)
    on public.artist_ratings from anon, authenticated;

  revoke insert, update on public.song_ratings from anon, authenticated;
  grant
    insert (user_id, song_mbid, release_mbid, score),
    update (user_id, song_mbid, release_mbid, score)
  on public.song_ratings to authenticated;
end $$;
