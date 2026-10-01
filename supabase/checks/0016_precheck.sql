-- Read-only. Run before migration 0016 to see which existing rows break its
-- rules. Changes nothing; every query only selects. An empty result for each
-- means 0016 will apply and validate cleanly.

-- 1. Usernames that differ only by case ("Alex" and "alex"). The
--    case-insensitive unique index is skipped while any of these exist.
select lower(username) as username, array_agg(username order by created_at) as variants
from public.profiles
group by lower(username)
having count(*) > 1;

-- 2. Usernames outside 3-20 letters, numbers and underscores.
select id, username from public.profiles
where username !~ '^[A-Za-z0-9_]{3,20}$';

-- 3. Names and bios longer than the profile form allows.
select id, username, char_length(display_name) as name_length, char_length(bio) as bio_length
from public.profiles
where char_length(display_name) > 50 or char_length(bio) > 300;

-- 4. Pictures that are neither an uploaded avatar nor a record avatar.
select id, username, avatar_url from public.profiles
where avatar_url is not null
  and avatar_url !~ '^/records/[0-9a-f-]{36}$'
  and avatar_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}/avatar\.(jpg|png|webp)(\?v=[0-9]+)?$';

-- 5. Album reviews over 1,000 characters (artist reviews are already capped).
select id, user_id, char_length(review) as length from public.ratings
where char_length(review) > 1000;

-- 6. Reports with a reason the form doesn't offer, or over-long detail.
select id, reason, char_length(detail) as detail_length from public.reports
where reason not in (
  'Abusive or hateful', 'Harassment or bullying', 'Spam or advertising',
  'Sexually explicit', 'Impersonation', 'Something else'
) or char_length(detail) > 500;
