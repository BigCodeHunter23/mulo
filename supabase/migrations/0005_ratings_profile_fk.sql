-- Ratings already point at auth.users. Add a second key straight to profiles
-- so PostgREST can join a rating to its author's username in one query, and
-- so a rating cannot exist without a profile to attribute it to.
alter table public.ratings
  drop constraint if exists ratings_user_id_profiles_fkey;

alter table public.ratings
  add constraint ratings_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
