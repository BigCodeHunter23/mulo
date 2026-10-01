/**
 * How long a site-wide read, the same for every visitor (The Charts, Heavy
 * Rotation, Discover's top rated), is kept and shared before it's counted
 * again. Long enough to spare the database on a busy page, short enough that
 * a new rating shows up while somebody is still looking.
 */
export const SHARED_CACHE_SECONDS = 300;
