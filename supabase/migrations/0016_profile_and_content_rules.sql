-- The rules the forms already follow, held by the database too.
--
-- Until now these lived only in the app's server actions. Row-level security
-- lets anybody change any column of their own profile through the API, so a
-- request that skipped the app could set a username that breaks links, an
-- avatar pointing at any site on the internet (which every visitor's browser
-- and the share-image renderer would then fetch), or unbounded text.
--
-- Each rule is added NOT VALID: it applies to every new or changed row at
-- once, without first checking old rows. The step at the end then tries to
-- check the old rows too, and if any break a rule it leaves that rule as it is
-- and says so, rather than failing. supabase/checks/0016_precheck.sql lists
-- those rows.
--
-- Safe to run more than once.

-- Add a CHECK constraint by name, unless it's already there.
create or replace function pg_temp.add_rule(tbl regclass, name text, rule text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_constraint where conrelid = tbl and conname = name) then
    execute format('alter table %s add constraint %I check (%s) not valid', tbl, name, rule);
  end if;
end $$;

-- Profiles -----------------------------------------------------------------
select pg_temp.add_rule('public.profiles', 'profiles_username_format',
  $r$username ~ '^[A-Za-z0-9_]{3,20}$'$r$);

select pg_temp.add_rule('public.profiles', 'profiles_display_name_length',
  'display_name is null or char_length(display_name) <= 50');

select pg_temp.add_rule('public.profiles', 'profiles_bio_length',
  'bio is null or char_length(bio) <= 300');

-- A picture is either an uploaded photo in this project's avatars bucket, at
-- the path the app writes, or a record avatar drawn by this site.
select pg_temp.add_rule('public.profiles', 'profiles_avatar_url_source', $r$
  avatar_url is null
  or avatar_url ~ '^/records/[0-9a-f-]{36}$'
  or avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}/avatar\.(jpg|png|webp)(\?v=[0-9]+)?$'
$r$);

-- One person per name, whatever the case: "Alex" and "alex" are the same to
-- anybody reading them. Skipped (with a notice) while any clash exists, since
-- a unique index can't be added over duplicates.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profiles_username_lower_key') then
    if exists (select 1 from public.profiles group by lower(username) having count(*) > 1) then
      raise notice 'Skipped profiles_username_lower_key: some usernames differ only by case. See supabase/checks/0016_precheck.sql.';
    else
      create unique index profiles_username_lower_key on public.profiles (lower(username));
    end if;
  end if;
end $$;

-- Reviews and reports ---------------------------------------------------------
-- Artist reviews were capped at 1,000 from the start (0008); album reviews never were.
select pg_temp.add_rule('public.ratings', 'ratings_review_length',
  'review is null or char_length(review) <= 1000');

select pg_temp.add_rule('public.reports', 'reports_detail_length',
  'detail is null or char_length(detail) <= 500');

-- The reasons on the report form (src/lib/report-reasons.ts).
select pg_temp.add_rule('public.reports', 'reports_reason_known', $r$
  reason in (
    'Abusive or hateful', 'Harassment or bullying', 'Spam or advertising',
    'Sexually explicit', 'Impersonation', 'Something else'
  )
$r$);

-- Check the rows already there ---------------------------------------------------
do $$
declare
  rule record;
begin
  for rule in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where not convalidated
      and conname in (
        'profiles_username_format', 'profiles_display_name_length', 'profiles_bio_length',
        'profiles_avatar_url_source', 'ratings_review_length', 'reports_detail_length',
        'reports_reason_known'
      )
  loop
    begin
      execute format('alter table %s validate constraint %I', rule.tbl, rule.conname);
    exception when check_violation then
      raise notice 'Left % on % unvalidated: some existing rows break it. See supabase/checks/0016_precheck.sql.',
        rule.conname, rule.tbl;
    end;
  end loop;
end $$;
