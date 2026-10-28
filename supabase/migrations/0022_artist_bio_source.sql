-- Where each artist's bio came from, so the pages can credit Wikipedia, as
-- its licence (CC BY-SA) asks. The Wikipedia article's address when the bio
-- is its opening paragraph; empty when the bio is MusicBrainz's own line or
-- there is none. Null means not noted yet: the website looks the artist up
-- again once and fills it in.
--
-- Safe to run more than once.

alter table public.artists
  add column if not exists bio_url text check (
    bio_url = ''
    or (char_length(bio_url) <= 2000 and bio_url like 'https://en.wikipedia.org/wiki/%')
  );
