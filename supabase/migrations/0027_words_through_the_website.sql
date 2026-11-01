-- The words people write that others read go in only through the website.
--
-- The word filter (src/lib/content-filter.ts) runs in the server actions. But
-- row-level security lets anyone signed in write their own rows straight
-- through the API with their own session, so until now the words could skip
-- it. 0024 closed this for replies; this closes it for every other column of
-- words people choose and others see:
--
--   profiles        username, display_name, bio
--   ratings         review
--   artist_ratings  review
--   versus_takes    body (the whole take is words: no inserts at all)
--   lists           title, description (a list needs a title: no inserts)
--   list_items      note
--
-- The website checks the words, then writes them with the service role, as
-- the signed-in person. Every other column stays writable as before: scores,
-- positions, Raised On, the photo, the ranked switch. Reading is untouched.
--
-- Postgres can't take one column away from a table-wide grant, and Supabase
-- grants every table to anon and authenticated whole. So each table's insert
-- and update are taken away whole, then given back column by column, without
-- the words, to signed-in people only (no policy ever let anon write these).
-- A column added to one of these tables later isn't writable by signed-in
-- people until a migration grants it.
--
-- Deploy the website that writes the words with the service role first. Run
-- before it, nobody can save a review, bio, take or list until it's live.
--
-- One statement, so the grants are never half done. Safe to run more than once.

do $$
begin
  revoke insert, update on public.profiles from anon, authenticated;
  grant update (
    id, avatar_url, created_at, raised_era, raised_scene, raised_on_mbid,
    record_colors, diary_public
  ) on public.profiles to authenticated;

  revoke insert, update on public.ratings from anon, authenticated;
  grant
    insert (user_id, release_mbid, score, created_at, updated_at),
    update (user_id, release_mbid, score, created_at, updated_at)
  on public.ratings to authenticated;

  revoke insert, update on public.artist_ratings from anon, authenticated;
  grant
    insert (user_id, artist_mbid, score, created_at, updated_at),
    update (user_id, artist_mbid, score, created_at, updated_at)
  on public.artist_ratings to authenticated;

  revoke insert, update on public.versus_takes from anon, authenticated;

  revoke insert, update on public.lists from anon, authenticated;
  grant update (user_id, ranked, created_at, updated_at) on public.lists to authenticated;

  revoke insert, update on public.list_items from anon, authenticated;
  grant
    insert (list_id, release_mbid, position, added_at),
    update (list_id, release_mbid, position, added_at)
  on public.list_items to authenticated;
end $$;
