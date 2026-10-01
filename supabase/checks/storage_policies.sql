-- Read-only. Shows how the avatars and covers buckets are set up, to compare
-- with what the app expects. Changes nothing.
--
-- Expected:
--   1. Both buckets exist and are public (anyone can view a cover or avatar).
--   2. No policy lets anon or authenticated users insert, update or delete
--      in either bucket. Uploads go through the server with the service role
--      (src/app/profile/actions.ts, src/lib/cover-storage.ts), which needs no
--      policy at all. Any write policy found here is a hole: it would let
--      people write to storage directly, around the app's checks.

-- 1. The buckets.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('avatars', 'covers');

-- 2. Every policy on stored files, with what it allows and to whom.
select policyname, cmd, roles, qual as using_expression, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;
