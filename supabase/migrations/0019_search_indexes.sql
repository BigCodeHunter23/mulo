-- Indexes for search.
--
-- Search matches any part of a name ("%query%"), which an ordinary index
-- can't help with, so every search read the whole artists, releases and
-- tracks tables. Trigram indexes (pg_trgm) answer those matches directly.
--
-- Building them briefly holds up writes to the catalogue tables (a few
-- seconds at MULO's size). Safe to run more than once.

create extension if not exists pg_trgm with schema extensions;

-- pg_trgm may already have been installed in another schema, so find its
-- operator class wherever it is rather than assuming.
do $$
declare
  ops text;
begin
  select format('%I.gin_trgm_ops', n.nspname) into ops
  from pg_opclass c
  join pg_namespace n on n.oid = c.opcnamespace
  join pg_am am on am.oid = c.opcmethod
  where c.opcname = 'gin_trgm_ops' and am.amname = 'gin'
  limit 1;

  execute format('create index if not exists artists_name_trgm_idx on public.artists using gin (name %s)', ops);
  execute format('create index if not exists artists_search_names_trgm_idx on public.artists using gin (search_names %s)', ops);
  execute format('create index if not exists releases_title_trgm_idx on public.releases using gin (title %s)', ops);
  execute format('create index if not exists releases_artist_credit_trgm_idx on public.releases using gin (artist_credit %s)', ops);
  execute format('create index if not exists tracks_title_trgm_idx on public.tracks using gin (title %s)', ops);
end $$;
