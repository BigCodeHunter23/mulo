/**
 * How long a site-wide read, the same for every visitor (The Charts, Heavy
 * Rotation, Discover's top rated), is kept and shared before it's counted
 * again. Long enough to spare the database on a busy page, short enough that
 * a new rating shows up while somebody is still looking.
 */
export const SHARED_CACHE_SECONDS = 300;

/**
 * How long a finished catalogue entry (an album's details, its tracklist, an
 * artist's photo and bio, who's like them) is kept. These barely change, and a
 * crawler comes back to the same page rarely, so only a long time saves much.
 */
export const CATALOG_CACHE_SECONDS = 24 * 60 * 60;

/**
 * How long signed-out visitors share an album's or artist's scores and reviews.
 * Somebody signed in always sees them live.
 */
export const SIGNED_OUT_CACHE_SECONDS = 60 * 60;
